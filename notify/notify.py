#!/usr/bin/env python3
"""
学习副本 · 每日催更
由 systemd timer 每 10 分钟调一次；脚本自己判断该不该发。

  python3 notify.py            正常检查
  python3 notify.py --test     立刻发一条测试
  python3 notify.py --dry      只打印判断结果，不发

配置：/srv/study-notify/config.json
状态：/srv/study-notify/state.json（记录今天催过了没）
数据：/srv/study-data/state.json（云同步的存档）
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE, "config.json")
STATE_PATH = os.path.join(BASE, "state.json")
DATA_PATH = os.environ.get("STUDY_DATA", "/srv/study-data/state.json")

DEFAULTS = {
    "channel": "ntfy",
    "url": "http://YOUR-SERVER/study/",
    "remindAfter": "20:30",
    "quietAfter": "23:30",
    "timezone": "Asia/Shanghai",
    "channels": {
        "ntfy": {"server": "https://ntfy.sh", "topic": ""},
        "serverchan": {"key": "", "api": ""},
        "pushplus": {"token": ""},
        "wecom": {"url": ""},
        "webhook": {"url": "", "body": "{\"text\": \"{text}\"}"},
        "email": {"host": "smtp.qq.com", "port": 465, "user": "", "password": "", "to": ""},
    },
}


def log(msg):
    sys.stderr.write("[notify] %s\n" % msg)


def load_json(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return fallback
    except Exception as e:
        log("读取 %s 失败: %s" % (path, e))
        return fallback


def save_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)
    # 里面有 token / 授权码，只给 root 读
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def deep_merge(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def study_day(now):
    """凌晨 4 点前算前一天，跟 App 里的规则一致。"""
    return (now - timedelta(hours=4)).date().isoformat()


def hhmm(text, fallback):
    try:
        h, m = str(text).split(":")
        return int(h) * 60 + int(m)
    except Exception:
        h, m = fallback.split(":")
        return int(h) * 60 + int(m)


# ── 发消息 ──────────────────────────────────────────────

def post(url, data, headers, timeout=8):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(300)


def send_ntfy(cfg, text):
    topic = (cfg.get("topic") or "").strip()
    if not topic:
        raise RuntimeError("ntfy 没配 topic")
    server = (cfg.get("server") or "https://ntfy.sh").rstrip("/")
    return post(
        server + "/" + urllib.parse.quote(topic),
        text.encode("utf-8"),
        {"Title": "Study Dungeon", "Tags": "books"},
    )


def check_body(status, body, ok_key, ok_value, label):
    """不少推送服务出错也返回 HTTP 200，只在 body 里给错误码。这里把它揪出来。"""
    try:
        obj = json.loads(body.decode("utf-8", "replace"))
    except Exception:
        return status, body
    if isinstance(obj, dict) and ok_key in obj and obj.get(ok_key) != ok_value:
        detail = obj.get("message") or obj.get("msg") or obj.get("errmsg") or ""
        raise RuntimeError("%s 返回 %s %s" % (label, obj.get(ok_key), detail))
    return status, body


def send_serverchan(cfg, text):
    key = (cfg.get("key") or "").strip()
    if not key:
        raise RuntimeError("serverchan 没配 key")
    api = (cfg.get("api") or "").strip()
    url = api if api else "https://sctapi.ftqq.com/%s.send" % key
    title = text.split("\n", 1)[0][:32]
    body = urllib.parse.urlencode({"title": title, "desp": text}).encode("utf-8")
    status, resp = post(url, body, {"Content-Type": "application/x-www-form-urlencoded"})
    return check_body(status, resp, "code", 0, "serverchan")


def send_pushplus(cfg, text):
    token = (cfg.get("token") or "").strip()
    if not token:
        raise RuntimeError("pushplus 没配 token")
    payload = json.dumps({
        "token": token,
        "title": text.split("\n", 1)[0][:32],
        "content": text,
        "template": "txt",
    }).encode("utf-8")
    status, resp = post("https://www.pushplus.plus/send", payload,
                        {"Content-Type": "application/json"})
    return check_body(status, resp, "code", 200, "pushplus")


def json_escape(text):
    """把文本塞进 JSON 字符串字面量里：反斜杠、引号、换行都得转义。"""
    return (text.replace("\\", "\\\\")
                .replace('"', '\\"')
                .replace("\r", "")
                .replace("\n", "\\n")
                .replace("\t", "\\t"))


def send_webhook(cfg, text):
    url = (cfg.get("url") or "").strip()
    if not url:
        raise RuntimeError("webhook 没配 url")
    tpl = cfg.get("body") or '{"text": "{text}"}'
    payload = tpl.replace("{text}", json_escape(text))
    return post(url, payload.encode("utf-8"), {"Content-Type": "application/json"})


def send_wecom(cfg, text):
    """企业微信群机器人：只需要一个 webhook 地址。"""
    url = (cfg.get("url") or "").strip()
    if not url:
        raise RuntimeError("wecom 没配 webhook 地址")
    payload = '{"msgtype":"text","text":{"content":"%s"}}' % json_escape(text)
    return post(url, payload.encode("utf-8"), {"Content-Type": "application/json"})


def send_email(cfg, text):
    """SMTP 发邮件。QQ 邮箱用 smtp.qq.com:465 + 授权码（不是登录密码）。"""
    import smtplib
    from email.mime.text import MIMEText

    host = (cfg.get("host") or "smtp.qq.com").strip()
    port = int(cfg.get("port") or 465)
    user = (cfg.get("user") or "").strip()
    password = (cfg.get("password") or "").strip()
    to = (cfg.get("to") or user).strip()
    if not user or not password:
        raise RuntimeError("email 没配账号或授权码")

    msg = MIMEText(text, "plain", "utf-8")
    msg["Subject"] = text.split("\n", 1)[0][:40]
    msg["From"] = user
    msg["To"] = to

    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=15)
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.starttls()
    try:
        server.login(user, password)
        server.sendmail(user, [to], msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass
    return 200, b"sent"


SENDERS = {
    "ntfy": send_ntfy,
    "serverchan": send_serverchan,
    "pushplus": send_pushplus,
    "wecom": send_wecom,
    "webhook": send_webhook,
    "email": send_email,
}


def send(cfg, text):
    channel = (cfg.get("channel") or "ntfy").strip()
    fn = SENDERS.get(channel)
    if not fn:
        raise RuntimeError("不认识的 channel: %s" % channel)
    status, body = fn(cfg.get("channels", {}).get(channel, {}), text)
    try:
        tail = body.decode("utf-8", "replace")[:160]
    except Exception:
        tail = str(body)[:160]
    log("已通过 %s 发送，HTTP %s %s" % (channel, status, tail))
    return status


# ── 主流程 ──────────────────────────────────────────────

def compose(now, data, cfg):
    player = (data.get("player") or {})
    streak = int(player.get("streak") or 0)
    freezes = int(player.get("freezes") or 0)

    quiet = hhmm(cfg.get("quietAfter"), "23:30")
    left = quiet - (now.hour * 60 + now.minute)
    if left <= 0:
        left = 24 * 60 - (now.hour * 60 + now.minute) + quiet
    left_txt = "还有 %d 小时 %d 分" % (left // 60, left % 60) if left >= 60 else "还有 %d 分钟" % left

    # 第一行会变成通知标题，所以固定带上名字，别让通知栏看不出是谁发的
    lines = ["学习副本 · 今天还没开张"]
    if streak >= 3:
        lines.append("%d 天连胜要断了。真想保命的话，做个 5 分钟的 low 任务也算数。" % streak)
    elif streak > 0:
        lines.append("%d 天连胜别断在这儿。做个最小的那个就行。" % streak)
    else:
        lines.append("不用从大的开始，5 分钟就够。")

    if freezes > 0:
        lines.append("（你还有 %d 张冻结卡，但别拿它当日常）" % freezes)

    lines.append("%s · %s" % (left_txt, cfg.get("url", "")))
    return "\n".join(lines)


USAGE = """用法：
  python3 notify.py --test          立刻发一条测试
  python3 notify.py --dry           只看判断结果
  python3 notify.py --setup pushplus <token>
  python3 notify.py --setup serverchan <SendKey> [完整api地址]
  python3 notify.py --setup wecom <群机器人 webhook 地址>
  python3 notify.py --setup ntfy <topic> [server]
  python3 notify.py --setup email <账号> <授权码> [收件人]
  python3 notify.py --setup webhook <url>
"""


def do_setup(argv, cfg):
    i = argv.index("--setup")
    rest = argv[i + 1:]
    if not rest:
        print(USAGE)
        return 1

    ch = rest[0]
    vals = rest[1:]
    channels = cfg.setdefault("channels", {})

    if ch == "pushplus" and vals:
        channels.setdefault("pushplus", {})["token"] = vals[0]
    elif ch == "serverchan" and vals:
        s = channels.setdefault("serverchan", {})
        s["key"] = vals[0]
        if len(vals) > 1:
            s["api"] = vals[1]
    elif ch == "wecom" and vals:
        channels.setdefault("wecom", {})["url"] = vals[0]
    elif ch == "ntfy" and vals:
        n = channels.setdefault("ntfy", {})
        n["topic"] = vals[0]
        if len(vals) > 1:
            n["server"] = vals[1]
    elif ch == "email" and len(vals) >= 2:
        e = channels.setdefault("email", {})
        e["user"] = vals[0]
        e["password"] = vals[1]
        if len(vals) > 2:
            e["to"] = vals[2]
    elif ch == "webhook" and vals:
        channels.setdefault("webhook", {})["url"] = vals[0]
    elif ch == "url" and vals:
        cfg["url"] = vals[0]
        save_json(CONFIG_PATH, cfg)
        print("应用地址已设为 %s" % vals[0])
        return 0
    else:
        print(USAGE)
        return 1

    cfg["channel"] = ch
    save_json(CONFIG_PATH, cfg)
    print("已切到 channel = %s" % ch)
    print("下一步：python3 /srv/study-notify/notify.py --test")
    return 0


def main():
    argv = sys.argv[1:]
    cfg = deep_merge(DEFAULTS, load_json(CONFIG_PATH, {}))

    if "--setup" in argv:
        return do_setup(argv, cfg)

    args = set(argv)

    if "--test" in args:
        text = "学习副本 · 测试消息\n这条能收到，说明通知通道是通的。\n" + cfg.get("url", "")
        try:
            send(cfg, text)
            print("测试消息已发送，channel =", cfg.get("channel"))
            return 0
        except Exception as e:
            print("发送失败：%s" % e)
            return 1

    tz = ZoneInfo(cfg.get("timezone") or "Asia/Shanghai")
    now = datetime.now(tz)
    sday = study_day(now)

    state = load_json(STATE_PATH, {})
    data = load_json(DATA_PATH, {}).get("data") or {}

    done = bool(((data.get("days") or {}).get(sday) or {}).get("quests"))
    already = state.get("lastReminded") == sday

    remind_after = hhmm(cfg.get("remindAfter"), "20:30")
    quiet_after = hhmm(cfg.get("quietAfter"), "23:30")
    minute = now.hour * 60 + now.minute

    reason = None
    if not data:
        reason = "没有同步数据，跳过（是不是还没开云同步？）"
    elif done:
        reason = "今天已经完成过了，不打扰"
    elif already:
        reason = "今天已经催过了"
    elif minute < remind_after:
        reason = "还没到提醒时间（%s）" % cfg.get("remindAfter")
    elif minute >= quiet_after:
        reason = "过了静默时间（%s）" % cfg.get("quietAfter")

    if "--dry" in args or reason:
        print("study_day=%s now=%s → %s" % (sday, now.strftime("%H:%M"), reason or "该发了"))
        if reason:
            return 0

    text = compose(now, data, cfg)
    if "--dry" in args:
        print("----- 将会发送 -----")
        print(text)
        return 0

    try:
        send(cfg, text)
    except Exception as e:
        log("发送失败: %s" % e)
        return 1

    state["lastReminded"] = sday
    state["lastAt"] = now.isoformat()
    save_json(STATE_PATH, state)
    print("reminded for %s" % sday)
    return 0


if __name__ == "__main__":
    sys.exit(main())
