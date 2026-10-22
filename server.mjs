// 极简静态服务器：只为 `pnpm dev` 用，零依赖。
// 平时直接双击 index.html 也能跑，这个文件可以不管。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT || 4321);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    const target = normalize(join(ROOT, pathname));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
});

// 绑 0.0.0.0：同一个 Wi-Fi 下手机才能连进来。只想本机用的话改成 '127.0.0.1'。
server.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) ips.push({ name: name, address: net.address });
    });
  });
  // Wi-Fi / 有线网卡排前面，虚拟网卡排后面
  ips.sort((a, b) => {
    const score = (n) => (/wi-?fi|wlan|ethernet|以太网|无线/i.test(n) ? 0 : 1);
    return score(a.name) - score(b.name);
  });

  console.log('\n  学习副本');
  console.log('  本机   http://127.0.0.1:' + PORT);
  ips.slice(0, 3).forEach((ip) => {
    console.log('  手机   http://' + ip.address + ':' + PORT + '    (' + ip.name + ')');
  });
  if (!ips.length) console.log('  手机   （没找到局域网地址，可能没连 Wi-Fi）');
  console.log('\n  手机打不开？依次检查：');
  console.log('   1. 手机和电脑连的是同一个 Wi-Fi（不是手机流量）');
  console.log('   2. Windows 防火墙放行 node.exe —— 首次运行会弹窗，选「专用网络」允许');
  console.log('      没弹窗就管理员执行一次：');
  console.log('      netsh advfirewall firewall add rule name="study-dungeon" dir=in action=allow protocol=TCP localport=' + PORT);
  console.log('   3. 有些公共/校园 Wi-Fi 开了「客户端隔离」，设备之间互相访问不了，只能换热点');
  console.log('');
});
