#!/bin/bash
# 一次性安装：目录、配置、systemd timer
set -e
DIR=/srv/study-notify
mkdir -p "$DIR"

if [ ! -f "$DIR/.topic" ]; then
  python3 -c 'import secrets; print("study-" + secrets.token_hex(8))' > "$DIR/.topic"
fi
TOPIC=$(cat "$DIR/.topic")

if [ ! -f "$DIR/config.json" ]; then
  cat > "$DIR/config.json" <<EOF
{
  "channel": "ntfy",
  "url": "http://YOUR-SERVER/study/",
  "remindAfter": "20:30",
  "quietAfter": "23:30",
  "timezone": "Asia/Shanghai",
  "channels": {
    "ntfy": { "server": "https://ntfy.sh", "topic": "$TOPIC" },
    "serverchan": { "key": "" },
    "pushplus": { "token": "" },
    "webhook": { "url": "", "body": "{\"text\": \"{text}\"}" }
  }
}
EOF
fi

chmod 600 "$DIR/config.json"

cp /tmp/study-notify.service /etc/systemd/system/study-notify.service
cp /tmp/study-notify.timer /etc/systemd/system/study-notify.timer
systemctl daemon-reload
systemctl enable --now study-notify.timer >/dev/null 2>&1

echo "topic=$TOPIC"
systemctl list-timers study-notify.timer --no-pager | head -3
