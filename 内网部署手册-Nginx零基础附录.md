# Nginx 零基础部署附录（数据字典查询台 · Linux 版）

> 面向完全没用过 Nginx 的同学，从上往下照抄即可。
> 文中 conf.d 配置已在 nginx 1.28 实测（首页 / 静态资源 / 刷新回退全部 200）。
> Windows 服务器的流程见文末附录 A。

---

## 一、安装 nginx（内网 Linux 服务器上执行）

先看是否已经装过：

```bash
nginx -v        # 输出版本号就说明已安装，直接跳到第二节
```

没装的话，按系统二选一：

```bash
# Ubuntu / Debian / 统信 UOS（apt 系）
sudo apt update && sudo apt install -y nginx

# CentOS / RHEL / 麒麟 Kylin（yum 系）
sudo yum install -y nginx
```

> **内网没外网装不了？** 在一台能上网、**相同系统版本**的电脑上下载离线包再拷进去：
> - yum 系：`yumdownloader --resolve nginx`（得到若干 .rpm），拷到服务器后 `sudo yum localinstall ./*.rpm`
> - apt 系：`apt download nginx nginx-common`（含依赖），拷过去 `sudo dpkg -i ./*.deb`
>
> 行内常见：内部其实有 yum/apt 镜像源，先试试直接装，多数能成。

装好后设为开机自启：

```bash
sudo systemctl enable --now nginx
```

---

## 二、上传壳包（在开发机/办公电脑上执行）

把 `dist.zip` 解压后的**内容**放到服务器 `/var/www/dictionary/`。

命令行方式（PowerShell / cmd 都行）：

```bash
# 1. 先在服务器上建目录
ssh 用户名@服务器IP "sudo mkdir -p /var/www/dictionary && sudo chown $USER /var/www/dictionary"

# 2. 把解压后的 dist 内容传上去（在 dist 目录里执行）
scp -r . 用户名@服务器IP:/var/www/dictionary/
```

不熟命令行就用 **WinSCP / FileZilla** 图形工具拖拽，效果一样。

传完检查——这个目录里应**直接**能看到：

```text
/var/www/dictionary/
├─ index.html
├─ assets\
├─ icons\
├─ illustrations\
└─ site.webmanifest
```

> ⚠️ 不要把文件放在 /root 或 /home 下再配 nginx——CentOS/麒麟的 SELinux 会拦截（表现为打开 403 但日志难懂）。放 /var/www 是安全区。

---

## 三、写配置（只新建一个文件，不动别的）

新建 `/etc/nginx/conf.d/dictionary.conf`：

```bash
sudo tee /etc/nginx/conf.d/dictionary.conf <<'EOF'
server {
    listen       8080;
    server_name  _;

    root  /var/www/dictionary;
    index index.html;

    # 刷新/直达任意路径都回退到 index.html（单页应用必需，别删）
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
    }
}
EOF
```

这段就是全部配置。`8080` 是端口（被占用就换，如 8090），`root` 指向壳包目录。

> 小知识：nginx 主配置 `/etc/nginx/nginx.conf` 最后一行有 `include /etc/nginx/conf.d/*.conf;`，所以放进去的这个文件会被自动加载，不需要改主配置。

---

## 四、生效 + 验证

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**成功长什么样：**

1. `nginx -t` 输出 `syntax is ok` 和 `test is successful`
2. 服务器本机：`curl -I http://localhost:8080` → 第一行 `HTTP/1.1 200 OK`
3. 服务器本机：`curl -I http://localhost:8080/tables` → 也是 200（单页回退生效，不是 404）
4. 浏览器访问 `http://服务器IP:8080` → 看到 **"从导入第一个数据源开始"**

任何一步失败：`sudo tail -20 /var/log/nginx/error.log`

---

## 五、放行防火墙（让其他电脑能访问）

```bash
# firewalld（CentOS / 麒麟默认）
sudo firewall-cmd --permanent --add-port=8080/tcp && sudo firewall-cmd --reload

# 或 ufw（Ubuntu / Debian 默认）
sudo ufw allow 8080/tcp
```

然后内网其他电脑浏览器打开 `http://服务器IP:8080`（IP 用 `ip addr` 查），出现导入页即部署完成。首次使用点"导入 Excel"选择内网的 `dp_ial.xlsx`。

---

## 六、日常运维速查

| 想做什么 | 命令 |
|---|---|
| 改完配置生效 | `sudo systemctl reload nginx` |
| 启动 / 停止 | `sudo systemctl start nginx` / `sudo systemctl stop nginx` |
| 看状态 | `systemctl status nginx` |
| 看报错日志 | `sudo tail -20 /var/log/nginx/error.log` |
| 看访问日志 | `sudo tail -20 /var/log/nginx/access.log` |

**更新版本**：新 dist.zip 的内容覆盖 `/var/www/dictionary/`，完事。配置永远不用再动：

```bash
scp -r . 用户名@服务器IP:/var/www/dictionary/    # 在新 dist 目录里执行
```

---

## 常见坑速查（Linux）

| 症状 | 原因 | 解法 |
|---|---|---|
| `bind() to 0.0.0.0:8080 failed (98: Address already in use)` | 端口被占 | 换 `listen` 端口；`ss -lntp \| grep 8080` 查占用 |
| 打开 **403 Forbidden** | 文件放错位置（SELinux）或权限不足 | 确认在 `/var/www/dictionary`；`sudo restorecon -Rv /var/www/dictionary`；`chmod -R o+rX /var/www/dictionary` |
| 打开是 **404** | `location / try_files` 没写或 root 指错层 | 对照第三节检查 `root` 应直接指向有 index.html 的目录 |
| 刷新某个页面变 404 | 同上 | 同上 |
| 本机 curl 通、别的电脑不通 | 防火墙没放行 | 见第五节 |
| `nginx -t` 报 `unknown directive` | 粘贴时少了分号或花括号 | 重新按第三节整段粘贴 |
| SELinux 拦截（CentOS/麒麟日志有 `AVC denied`） | 文件上下文不对 | `sudo restorecon -Rv /var/www/dictionary` |

---

## 附录 A：Windows 服务器版（如果以后换 Windows）

1. 下载 https://nginx.org/en/download.html 的 **nginx/Windows** zip，解压到 `D:\nginx`（路径避免中文空格）
2. 壳包解压到 `D:\nginx\html\dictionary\`
3. 记事本打开 `D:\nginx\conf\nginx.conf`，全选替换为：

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
           root  D:/nginx/html/dictionary;
           index index.html;
           location / {
               try_files $uri $uri/ /index.html;
           }
           location /assets/ {
               expires 30d;
           }
       }
   }
   ```

   （Windows 路径必须用正斜杠 `/`）

4. PowerShell：

   ```powershell
   cd D:\nginx
   .\nginx.exe -t
   start nginx
   netsh advfirewall firewall add rule name="nginx-8080" dir=in action=allow protocol=TCP localport=8080
   ```

5. 开机自启可用 NSSM：`D:\nssm.exe install nginx D:\nginx\nginx.exe`，然后 `Start-Service nginx`
