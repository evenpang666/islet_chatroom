import os from "node:os";

// Prefer physical Ethernet, then Wi-Fi; exclude virtual/VPN interfaces.
const privateIp = ip => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip || "");
export function selectLan(interfaces = os.networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    /virtual|vmware|vbox|vethernet|vpn|tunnel|docker|bridge|^br-|^veth|tailscale|zerotier|wireguard|^tun|^tap/i.test(name) ? [] :
    (addresses || []).filter(a => a.family === "IPv4" && !a.internal && privateIp(a.address))
      .map(a => ({ name, address: a.address, netmask: a.netmask }))
  );
  const priority = a => (/^(eth\d|en\w|以太网|ethernet)/i.test(a.name) ? 0 : 2) + (a.address.startsWith("192.168.") ? 0 : 1);
  return candidates.sort((a,b) => priority(a)-priority(b))[0] || null;
}
const ipv4 = address => address?.replace(/^::ffff:/, "");
export const isLoopback = address => ["127.0.0.1", "::1"].includes(ipv4(address));
export const isLocalHost = host => /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
const bits = ip => ip.split(".").reduce((n, v) => (n << 8) | Number(v), 0) >>> 0;
export function allowedClient(address, lan) {
  if (isLoopback(address)) return true;
  const ip = ipv4(address);
  return !!(lan && privateIp(ip) &&
    (bits(ip) & bits(lan.netmask)) === (bits(lan.address) & bits(lan.netmask)));
}
export function allowedHost(host, lan) {
  return isLocalHost(host) || !!(lan && host.split(":")[0] === lan.address && /^\d+$/.test(host.split(":")[1] || ""));
}
