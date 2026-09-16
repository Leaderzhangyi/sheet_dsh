#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 查询 OpenAI 兼容网关的可用模型：
#   python scripts/list_models.py [网关地址] [API_KEY] [--intranet]
# 示例：python scripts/list_models.py https://open.bigmodel.cn/api/paas/v4 sk-xxx
import ipaddress
import json
import socket
import sys
import urllib.request
from urllib.parse import urlparse

base = (sys.argv[1] if len(sys.argv) > 1 else "https://open.bigmodel.cn/api/paas/v4").rstrip("/")
key = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "--intranet" else ""
intranet = "--intranet" in sys.argv

# SSRF 防护：仅 http/https；环回/链路本地/保留地址始终阻断（含云元数据 169.254.169.254），
# 内网私网地址需操作者显式加 --intranet（链路本地与保留段仍拦截）。
url = urlparse(base)
assert url.scheme in ("http", "https"), f"地址仅支持 http/https：{base}"
for ip in {info[4][0] for info in socket.getaddrinfo(url.hostname, None)}:
    addr = ipaddress.ip_address(ip)
    if addr.is_link_local or addr.is_reserved or addr.is_multicast:
        sys.exit(f"已阻断目标 {ip}（链路本地/保留地址）")
    if (addr.is_private or addr.is_loopback) and not intranet:
        sys.exit(f"{ip} 是内网地址：内网网关请加 --intranet 参数后重试")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


req = urllib.request.Request(f"{base}/models", headers={"Authorization": f"Bearer {key}"} if key else {})
models = json.load(urllib.request.build_opener(NoRedirect).open(req, timeout=15)).get("data", [])
print(f"发现 {len(models)} 个可用模型：")
for model_id in sorted(str(item.get("id", "")) for item in models if item.get("id")):
    print(f"  - {model_id}")
