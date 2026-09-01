# Nginx 零基础部署附录（数据字典查询台）

> 本附录面向完全没用过 Nginx 的同学。照着从上到下做即可，中间每一步都有"成功长什么样"。
> 文中配置已在 Windows + nginx 1.28 实测通过（首页 / 静态资源 / 刷新回退全部 200）。

---

## 一、准备两样东西

| 东西 | 哪来的 | 放哪 |
|---|---|---|
| **nginx 程序包** | 在能上网的电脑打开 https://nginx.org/en/download.html ，下载 **nginx/Windows** 稳定版（一个 zip） | 拷贝到内网服务器，解压到 **`D:\nginx`**（路径不要有中文、空格） |
| **壳包 dist.zip** | 开发机构建 `npm run build` 后压缩的 `dist` 目录 | 解压到 **`D:\nginx\html\dictionary\`**，最终这个文件夹里直接能看到 `index.html`、`assets`、`icons` 等 |

解压好之后目录长这样（关键位置）：

```text
D:\nginx\
├─ nginx.exe            ← 程序本体
├─ conf\
│  └─ nginx.conf        ← 待会儿要改的唯一文件
├─ html\
│  └─ dictionary\       ← 壳包解压在这里
│     ├─ index.html
│     ├─ assets\ ...
│     ├─ icons\ ...
│     └─ site.webmanifest
└─ logs\                ← 出问题时看这里的 error.log
```

---

## 二、改配置（整份替换，不用理解）

用记事本打开 `D:\nginx\conf\nginx.conf`，**全选删掉**，粘贴下面内容，只改两处：

1. `root` 那行 → 改成你实际的壳包目录（**Windows 路径必须用正斜杠 `/`**）
2. `listen` 端口 8080 → 被占用就换一个（如 8090）

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;

    server {
        listen       8080;
        server_name  _;

        # ← 改这里：壳包解压目录，Windows 路径用正斜杠 /
        root  D:/nginx/html/dictionary;
        index index.html;

        # 刷新/直达任意路径都回退到 index.html（单页应用必需，别删）
        location / {
            try_files $uri $uri/ /index.html;
        }

        # 构建产物带内容指纹，可以长缓存
        location /assets/ {
            expires 30d;
        }
    }
}
```

---

## 三、启动并验证

在内网服务器上打开 **PowerShell** 或 cmd：

```powershell
cd D:\nginx
.\nginx.exe -t          # ① 检查配置
start nginx             # ② 启动（窗口一闪而过是正常的，它在后台）
```

**成功长什么样：**

1. `nginx.exe -t` 输出 `the configuration file ... syntax is ok` 和 `test is successful`
2. 在服务器本机浏览器打开 `http://localhost:8080` → 看到 **"从导入第一个数据源开始"** 页面
3. 按 F12 → 地址栏随便输个 `http://localhost:8080/xxx` 回车 → 仍然显示该页面（不是 404）→ 说明单页回退生效

任何一步失败：看 `D:\nginx\logs\error.log` 最后几行。

---

## 四、让内网其他电脑访问（防火墙放行）

1. 查服务器内网 IP：

   ```powershell
   ipconfig        # 看"IPv4 地址"，例如 10.20.30.5
   ```

2. 放行端口（管理员 PowerShell，一条命令）：

   ```powershell
   netsh advfirewall firewall add rule name="nginx-8080" dir=in action=allow protocol=TCP localport=8080
   ```

3. 其他电脑浏览器访问 `http://10.20.30.5:8080` → 出现导入页即成功。

> 若仍打不开：确认 nginx 在跑（`tasklist | findstr nginx` 应有两行）、端口没写错、双方向防火墙/网段可达。

---

## 五、日常运维四条命令

| 想做什么 | 命令（在 `D:\nginx` 下执行） |
|---|---|
| 改完配置后生效（不重启） | `.\nginx.exe -s reload` |
| 停止 | `.\nginx.exe -s quit` |
| 启动 | `start nginx` |
| 卡死强杀 | `taskkill /f /im nginx.exe` |

**更新版本**：新的 dist.zip 解压覆盖 `html\dictionary\` 里的内容，浏览器强刷（Ctrl+F5）即可，无需改配置。

---

## 六、（可选）开机自启

最简单：把 nginx 注册成 Windows 服务，开机自动跑、崩了自动拉起。

1. 下载 NSSM（https://nssm.cc/download ，同样拷进内网），放 `D:\nssm.exe`
2. 管理员 PowerShell：

   ```powershell
   D:\nssm.exe install nginx D:\nginx\nginx.exe
   # 参数：nginx 需要在自己的目录下启动
   D:\nssm.exe set nginx AppDirectory D:\nginx
   Start-Service nginx
   ```

3. 之后用 `Start-Service nginx` / `Stop-Service nginx` 管理即可。

---

## 七、如果内网服务器是 Linux（备忘）

```bash
sudo apt install nginx                          # CentOS 用 yum install nginx
sudo mkdir -p /var/www/dictionary
# 壳包内容解压到 /var/www/dictionary
sudo tee /etc/nginx/conf.d/dictionary.conf <<'EOF'
server {
    listen 8080;
    server_name _;
    root /var/www/dictionary;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
sudo firewall-cmd --add-port=8080/tcp --permanent && sudo firewall-cmd --reload   # firewalld 场景
```

---

## 常见坑速查

| 症状 | 原因 | 解法 |
|---|---|---|
| `bind() to 0.0.0.0:8080 failed` | 端口被占 | 换 `listen` 端口，或 `netstat -ano \| findstr 8080` 找到占用进程 |
| 打开是 **403 Forbidden** | `root` 路径写错/没指向 index.html 那层 | 检查 `root` 是否正斜杠、是否解压到正确层级 |
| 打开是 **404** | `location / try_files` 被删了 | 照第二节把配置粘回去 |
| 刷新某个页面变 404 | 同上 | 同上 |
| 本机能开、别的电脑打不开 | 防火墙没放行 | 见第四节第 2 步 |
| 页面空白、控制台报 MIME 错误 | `include mime.types` 被删 | 照第二节把配置粘回去 |
