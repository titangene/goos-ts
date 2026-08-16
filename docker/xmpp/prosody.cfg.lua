-- Prosody 部署用的設定檔——複製自官方 prosodyim/prosody image 內建的
-- prosody-13.0.cfg.lua（見 https://github.com/prosody/prosody-docker/blob/master/configs/prosody-13.0.cfg.lua），
-- 差異是加了 http_interfaces 跟 allow_unencrypted_plain_auth 這兩行。
--
-- Prosody 從某個版本起，明文 HTTP（預設 5280）改成預設只監聽 localhost
-- （http_interfaces = { "127.0.0.1", "::1" }），只有 HTTPS（5281）預設對外。
-- Render（以及大多數 PaaS）的做法是自己在邊界做 TLS termination，
-- 用明文 HTTP 連到 container 內部指定的 port，所以需要明文 HTTP 對外監聽，
-- 而不是走 Prosody 自己的 HTTPS。這一行必須放在任何 VirtualHost 之前
-- （Prosody 設定檔用「VirtualHost 之前 = global」這個規則），
-- 不能透過官方 image 預設的 conf.d include（放在檔案最後面）加，
-- 那樣只會套用到最後一個 VirtualHost，不會是真正的 global 設定。
--
-- 同樣的道理，Prosody 從 0.12 版起走「預設安全」路線，兩個設定都要放寬
-- 才能在未加密連線上完成登入，缺一個都不行：
--
-- 1. c2s_require_encryption 官方文件（mod_tls）明確寫預設值是 true——只要
--    有憑證存在（官方 image 一定會自動產生），Prosody 就會直接拒絕未加密
--    連線本身，甚至不提供任何 stream feature，client 端看到的是
--    <stream:error><undefined-condition/>No stream features to proceed
--    with</stream:error>，比下面 SASL 那層更早發生。
-- 2. allow_unencrypted_plain_auth 官方文件（mod_saslauth）預設 false，
--    PLAIN/LOGIN 這兩個機制在未加密連線上預設被禁用，就算過了第 1 關，
--    Strophe.js 端會看到「Server did not offer a supported authentication
--    mechanism」。
--
-- 不管是本機 `ws://`（本來就沒有 TLS）還是 Render 部署（邊界做 TLS
-- termination，Prosody 實際收到的仍是明文 WebSocket），從 Prosody 自己的
-- 視角看都是「未加密連線」，這兩個設定都要放寬，見
-- poc/docs/deploy.md「未加密連線放寬」。這是刻意放寬安全限制的
-- 決定，理由跟 ADR-0003 一致：這是練習 TDD 用的 poc 專案，不是要打造安全
-- 的正式系統。
c2s_require_encryption = false
allow_unencrypted_plain_auth = true

local _unpack = Lua.table.unpack;
local function _split(s, sep)
	if not s then return nil; end
	sep = sep or ",";
	local parts = {};
	for part in s:gmatch("[^"..sep.."]+") do
		parts[#parts+1] = part;
	end
	return parts;
end

plugin_paths = _split(ENV_PROSODY_PLUGIN_PATHS or "/etc/prosody/modules")

admins = _split(ENV_PROSODY_ADMINS)

-- 這是這次唯一新增的一行：讓明文 HTTP（給 Render 的健康檢查/反向代理用）
-- 對外監聽，而不是官方預設的 localhost-only。
http_interfaces = { "0.0.0.0", "::" }

modules_enabled = {
		"disco";
		"roster";
		"saslauth";
		"tls";

		"blocklist";
		"bookmarks";
		"carbons";
		"dialback";
		"limits";
		"pep";
		"private";
		"smacks";
		"vcard4";
		"vcard_legacy";

		"csi_simple";
		"invites";
		"invites_adhoc";
		"invites_register";
		"ping";
		"register";
		"time";
		"uptime";
		"version";

		"admin_adhoc";
		"admin_shell";
}

if ENV_PROSODY_ENABLE_MODULES then
	modules_enabled:append(_split(ENV_PROSODY_ENABLE_MODULES))
end

if ENV_PROSODY_TURN_SECRET then
	modules_enabled:append{ "turn_external" };
	turn_external_secret = ENV_PROSODY_TURN_SECRET
	turn_external_host = ENV_PROSODY_TURN_HOST
	turn_external_port = ENV_PROSODY_TURN_PORT
	turn_external_tls_port = ENV_PROSODY_TURN_TLS_PORT
end

if ENV_PROSODY_RETENTION_DAYS or ENV_PROSODY_ARCHIVE_EXPIRY_DAYS then
	modules_enabled:append{ "mam" }
end

modules_disabled = _split(ENV_PROSODY_DISABLE_MODULES)

s2s_secure_auth = ENV_PROSODY_S2S_SECURE_AUTH ~= "0"

use_dane = ENV_PROSODY_USE_DANE and true or false
unbound = {
	trustfile = ENV_PROSODY_USE_DANE and "/usr/share/dns/root.ds";
	forward = _split(ENV_PROSODY_DNS_RESOLVERS);
}

limits = {
	c2s = {
		rate = ENV_PROSODY_C2S_RATE_LIMIT or "10kb/s";
	};
	s2sin = {
		rate = ENV_PROSODY_S2S_RATE_LIMIT or "30kb/s";
	};
}

authentication = "internal_hashed"

storage = ENV_PROSODY_SQL_DRIVER and "sql" or ENV_PROSODY_STORAGE or "internal"

if ENV_PROSODY_SQL_DRIVER then
	sql = {
		driver = ENV_PROSODY_SQL_DRIVER;
		database = ENV_PROSODY_SQL_DB;
		username = ENV_PROSODY_SQL_USERNAME;
		password = ENV_PROSODY_SQL_PASSWORD;
		host = ENV_PROSODY_SQL_HOST;
	}
end

archive_expires_after = (ENV_PROSODY_ARCHIVE_EXPIRY_DAYS or ENV_PROSODY_RETENTION_DAYS or "7").."d"

log = {
	[ENV_PROSODY_LOGLEVEL or "info"] = "*console";
}

statistics = ENV_PROSODY_STATISTICS
statistics_interval = Lua.tonumber(ENV_PROSODY_STATISTICS_INTERVAL) or ENV_PROSODY_STATISTICS_INTERVAL

certificates = ENV_PROSODY_CERTIFICATES or "certs"

----------- Virtual hosts -----------

local pp = Lua.require "prosody.util.pposix";
local vhosts = _split(ENV_PROSODY_VIRTUAL_HOSTS) or {pp.uname().nodename};

local network_hostname = ENV_PROSODY_NETWORK_HOSTNAME or #vhosts == 1 and vhosts[1];
if network_hostname then
	http_host = network_hostname
	proxy65_address = network_hostname
	if ENV_PROSODY_TURN_SECRET and not ENV_PROSODY_TURN_HOST then
		turn_external_host = network_hostname
	end
end

for _, vhost in Lua.ipairs(vhosts) do
	VirtualHost (vhost)
end

------ Components ------

for _, component_def in Lua.ipairs(_split(ENV_PROSODY_COMPONENTS) or {}) do
	local c_name, c_type = _unpack(_split(component_def, ":"));
	Component (c_name) (c_type)

	if c_type == "muc" then
		modules_enabled = _split(ENV_PROSODY_MUC_MODULES)
	elseif c_type == "http_file_share" then
		http_file_share_expire_after = 60 * 60 * 24 * tonumber(ENV_PROSODY_UPLOAD_EXPIRY_DAYS or ENV_PROSODY_RETENTION_DAYS or "7")
		if ENV_PROSODY_UPLOAD_LIMIT_MB then
			http_file_share_size_limit = (1024 * 1024 * tonumber(ENV_PROSODY_UPLOAD_LIMIT_MB)) + 16
		end
		if ENV_PROSODY_UPLOAD_STORAGE_GB then
			http_file_share_global_quota = 1024 * 1024 * 1024 * tonumber(ENV_PROSODY_UPLOAD_STORAGE_GB)
		end
		http_paths = {
			file_share = "/share";
		}
	end
end

for _, component_def in Lua.ipairs(_split(ENV_PROSODY_EXTERNAL_COMPONENTS) or {}) do
	local c_name, c_secret = _unpack(_split(component_def, ":"));
	Component (c_name)
		component_secret = c_secret or ENV_PROSODY_COMPONENT_SECRET
end

Include (ENV_PROSODY_EXTRA_CONFIG or "/etc/prosody/conf.d/*.cfg.lua")
