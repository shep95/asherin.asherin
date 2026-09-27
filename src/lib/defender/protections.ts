// asherin.defender — the protection register.
//
// NARRATIVE (what this file exists for)
// The old defender was a tab looking at itself: it froze this origin's tracker
// beacons, counted HID grants this origin had been given, and printed "this is
// unsure" everywhere else. That is one room of a house being guarded while the
// doors stand open. The operator did not buy a tab guard, they bought a device
// guard: files, disks, network, bluetooth, browsers and their extensions,
// installed apps, background processes, downloads, battery, updates, accounts.
//
// A browser tab cannot read any of that, and pretending otherwise is the flaw
// we refuse to ship. So the register names, for every protection, whether this
// page can see it:
//
//   • BROWSER  — what this page can genuinely measure on this device right now.
//   • AGENT    — outside a browser's reach. Stays `unmeasured`, never green.
//
// Every entry below names WHICH surface can see it. A check with no reading
// from either surface shows as `unmeasured` — never as green.

export type ProtectionSource = "browser" | "agent" | "both";

export type ProtectionCategory =
  | "device"
  | "disk"
  | "files"
  | "network"
  | "wireless"
  | "bluetooth"
  | "browser"
  | "extensions"
  | "apps"
  | "processes"
  | "accounts"
  | "privacy"
  | "power"
  | "updates"
  | "peripherals"
  | "surveillance"
  | "data"
  | "recovery";

export interface Protection {
  id: string;
  cat: ProtectionCategory;
  /** lowercase, plain, what is actually being guarded */
  title: string;
  /** why it matters — one sentence an operator can act on */
  why: string;
  src: ProtectionSource;
  sev: "critical" | "high" | "medium" | "low";
}

const p = (
  id: string,
  cat: ProtectionCategory,
  title: string,
  why: string,
  src: ProtectionSource,
  sev: Protection["sev"] = "medium",
): Protection => ({ id, cat, title, why, src, sev });

/**
 * The register. 140 named protections across 18 categories.
 * Order inside a category is roughly worst-first.
 */
export const PROTECTIONS: Protection[] = [
  // ── device ────────────────────────────────────────────────────────────
  p("dev.os-supported", "device", "operating system still supported", "an end-of-life os stops receiving security fixes entirely.", "agent", "critical"),
  p("dev.os-patch-level", "device", "os patch level current", "unpatched kernels are the most reliable way in.", "agent", "critical"),
  p("dev.secure-boot", "device", "secure boot enabled", "without it a tampered bootloader loads before any defence does.", "agent", "high"),
  p("dev.tpm", "device", "tpm / secure enclave present", "hardware key storage is what makes disk encryption meaningful.", "agent", "high"),
  p("dev.sip", "device", "system integrity protection on", "sip / kernel lockdown blocks silent system-file rewrites.", "agent", "high"),
  p("dev.jailbroken", "device", "device not rooted or jailbroken", "root removes every sandbox the os would otherwise enforce.", "agent", "critical"),
  p("dev.dev-mode", "device", "developer mode off", "developer mode and usb debugging are a full-device backdoor when left on.", "agent", "high"),
  p("dev.virtualisation", "device", "no unexpected hypervisor", "an unexpected hypervisor layer can observe everything above it.", "agent", "medium"),
  p("dev.clock-skew", "device", "system clock accurate", "a wrong clock silently breaks certificate validation.", "both", "medium"),
  p("dev.locale-leak", "device", "locale and timezone consistent", "a mismatch between reported timezone and ip is a fingerprint and a proxy tell.", "browser", "low"),
  p("dev.hardware-shape", "device", "hardware profile recorded", "a baseline is what makes a later change visible.", "both", "low"),
  p("dev.serial-drift", "device", "no unexplained hardware change", "a swapped disk or nic between reports deserves an explanation.", "agent", "medium"),

  // ── disk ──────────────────────────────────────────────────────────────
  p("disk.encryption", "disk", "full disk encryption on", "without it, the device is readable by anyone who holds it.", "agent", "critical"),
  p("disk.recovery-key", "disk", "recovery key escrowed safely", "an unescrowed key means one wipe is total loss.", "agent", "high"),
  p("disk.free-space", "disk", "free space healthy", "a full disk stops logging, updating and snapshotting.", "agent", "low"),
  p("disk.swap-encrypted", "disk", "swap / pagefile encrypted", "plaintext swap can contain keys and passwords.", "agent", "high"),
  p("disk.external-mounts", "disk", "external volumes reviewed", "an unknown mounted volume is an unknown data path.", "agent", "medium"),
  p("disk.smart-health", "disk", "drive health sane", "failing media loses evidence and backups first.", "agent", "medium"),
  p("disk.hibernation-file", "disk", "hibernation file protected", "hiberfil holds a memory image, keys included.", "agent", "medium"),
  p("disk.time-machine", "disk", "system snapshots present", "snapshots are the only fast recovery from ransomware.", "agent", "high"),

  // ── files ─────────────────────────────────────────────────────────────
  p("file.scan-coverage", "files", "file scan coverage", "a scan that never ran protects nothing.", "agent", "high"),
  p("file.malware-signature", "files", "no known-bad file signatures", "known-bad hashes are the cheapest catch available.", "agent", "critical"),
  p("file.suspicious-exec", "files", "no executables in download folders", "a binary sitting in downloads is the classic first stage.", "agent", "high"),
  p("file.world-writable", "files", "no world-writable system files", "anyone on the box can rewrite a world-writable target.", "agent", "high"),
  p("file.setuid-drift", "files", "no unexpected setuid binaries", "a new setuid binary is a privilege escalation waiting to run.", "agent", "critical"),
  p("file.hidden-launch", "files", "no hidden autostart scripts", "stalkerware hides in login items, not in the app list.", "agent", "critical"),
  p("file.recent-large-writes", "files", "no mass file rewrite", "thousands of files rewritten in minutes is ransomware behaviour.", "agent", "critical"),
  p("file.ssh-key-perms", "files", "private keys not world-readable", "a readable private key is a stolen private key.", "agent", "critical"),
  p("file.dotenv-exposure", "files", "no secrets in plain project files", "env files carry live credentials into every backup.", "agent", "high"),
  p("file.cloud-sync-scope", "files", "cloud sync folders reviewed", "sync folders quietly copy sensitive files off the device.", "agent", "medium"),
  p("file.tempdir-hygiene", "files", "temp directories not hoarding data", "temp is where exfil staging happens.", "agent", "medium"),
  p("file.quarantine-flag", "files", "downloaded files still quarantined", "stripped quarantine flags skip the os gatekeeper.", "agent", "medium"),
  p("file.integrity-baseline", "files", "critical file baseline stable", "hash drift on system binaries is a compromise signal.", "agent", "high"),
  p("file.shadow-copies", "files", "shadow copies intact", "ransomware deletes shadow copies before it encrypts.", "agent", "high"),

  // ── network ───────────────────────────────────────────────────────────
  p("net.firewall", "network", "firewall enabled", "an off firewall exposes every listening service on every network.", "agent", "critical"),
  p("net.listening-ports", "network", "no unexpected listening ports", "a listening port you cannot name is a door you did not open.", "agent", "critical"),
  p("net.remote-desktop", "network", "remote desktop / ssh reviewed", "remote access services are the most abused legitimate feature.", "agent", "critical"),
  p("net.outbound-beacons", "network", "no fixed-host idle beacon", "steady traffic to one host while idle is a command channel.", "agent", "high"),
  p("net.dns-server", "network", "dns resolver trusted", "a hijacked resolver reroutes every site you visit.", "agent", "high"),
  p("net.dns-encrypted", "network", "encrypted dns in use", "plain dns publishes your entire browsing list to the network.", "agent", "medium"),
  p("net.proxy-config", "network", "no silent system proxy", "a system proxy can read tls traffic if it installed a root.", "agent", "critical"),
  p("net.vpn-state", "network", "vpn state known", "a dropped vpn exposes traffic you believed was tunnelled.", "both", "high"),
  p("net.captive-portal", "network", "not sitting behind a captive portal", "portals intercept traffic by design.", "browser", "low"),
  p("net.public-wifi", "network", "not on an open network", "open wifi is a shared cable with strangers.", "both", "high"),
  p("net.arp-anomaly", "network", "no arp table duplication", "duplicate mac for the gateway is a man-in-the-middle tell.", "agent", "high"),
  p("net.gateway-change", "network", "gateway stable", "a gateway that changes mid-session may not be yours.", "agent", "medium"),
  p("net.ipv6-leak", "network", "no ipv6 leak around the tunnel", "ipv6 routes around most vpn configurations silently.", "agent", "medium"),
  p("net.webrtc-leak", "network", "no webrtc address leak", "webrtc publishes local addresses to any page that asks.", "browser", "medium"),
  p("net.tls-inspection", "network", "no tls interception root", "an extra root certificate means someone can read https.", "agent", "critical"),
  p("net.cert-store", "network", "certificate store clean", "one rogue root certificate defeats every https guarantee.", "agent", "critical"),
  p("net.hosts-file", "network", "hosts file unmodified", "hosts entries silently redirect banking and update domains.", "agent", "high"),
  p("net.port-forward", "network", "no upnp port forward from this host", "upnp can open your machine to the internet without a prompt.", "agent", "high"),
  p("net.traffic-volume", "network", "outbound volume within baseline", "a bulk upload at 3am is exfiltration until proven otherwise.", "agent", "high"),
  p("net.link-quality", "network", "active link measured", "knowing the transport is the floor of any network judgement.", "browser", "low"),
  p("net.online-state", "network", "connectivity state known", "an offline device cannot be reporting, and silence must be visible.", "browser", "low"),

  // ── wireless ──────────────────────────────────────────────────────────
  p("wifi.ssid-known", "wireless", "connected ssid recognised", "an unfamiliar ssid with a familiar name is the rogue ap trick.", "agent", "high"),
  p("wifi.encryption", "wireless", "wifi encryption strong", "wep and open networks are readable in the air.", "agent", "high"),
  p("wifi.duplicate-ssid", "wireless", "no duplicate ssid nearby", "two access points claiming one name means one is lying.", "agent", "high"),
  p("wifi.saved-networks", "wireless", "saved networks pruned", "saved open networks make your device auto-join impostors.", "agent", "medium"),
  p("wifi.mac-randomisation", "wireless", "mac randomisation on", "a fixed mac tracks you across every network you touch.", "agent", "medium"),
  p("wifi.hotspot-off", "wireless", "personal hotspot off when unused", "an idle hotspot is an open bridge into your session.", "agent", "medium"),
  p("wifi.pineapple-pattern", "wireless", "no karma-style beacon flood", "a flood of probe responses is an active wifi attack tool.", "agent", "high"),
  p("wifi.signal-baseline", "wireless", "signal environment baselined", "a new strong beacon in a static room is worth a look.", "agent", "low"),

  // ── bluetooth ─────────────────────────────────────────────────────────
  p("bt.radio-state", "bluetooth", "bluetooth radio state known", "a radio you forgot is on is a radio someone can reach.", "both", "medium"),
  p("bt.paired-inventory", "bluetooth", "paired devices all recognised", "an unknown pairing is an authorised channel you did not authorise.", "both", "high"),
  p("bt.discoverable-off", "bluetooth", "not discoverable", "discoverable mode invites pairing attempts from anyone in range.", "agent", "medium"),
  p("bt.hid-pairing", "bluetooth", "no unknown bluetooth keyboard", "a paired hid device can type into your session.", "both", "critical"),
  p("bt.audio-route", "bluetooth", "audio route expected", "an unexpected audio sink is a live microphone route.", "agent", "high"),
  p("bt.tracker-tags", "bluetooth", "no unfamiliar tracker tag following you", "commodity tags are the cheapest physical tracking available.", "agent", "high"),
  p("bt.le-advertising", "bluetooth", "device not advertising unnecessarily", "constant le advertising is a persistent identifier.", "agent", "medium"),
  p("bt.firmware", "bluetooth", "bluetooth stack patched", "bluetooth stacks have shipped remote code execution bugs.", "agent", "high"),

  // ── browser ───────────────────────────────────────────────────────────
  p("br.installed-browsers", "browser", "installed browsers inventoried", "every extra browser is another profile, another cookie jar.", "agent", "medium"),
  p("br.background-tabs", "browser", "background tabs accounted for", "a background tab keeps running scripts, camera grants and sockets.", "both", "medium"),
  p("br.background-processes", "browser", "browser background processes reviewed", "browsers keep working after the window closes.", "agent", "medium"),
  p("br.default-engine", "browser", "default search engine expected", "a hijacked default search engine reads every query.", "agent", "high"),
  p("br.search-engines", "browser", "no injected search providers", "injected providers are the classic adware persistence.", "agent", "high"),
  p("br.homepage-hijack", "browser", "homepage and new tab unmodified", "startup page hijacks survive reinstalls of the extension.", "agent", "medium"),
  p("br.download-history", "browser", "recent downloads reviewed", "the download list is where the first stage always appears.", "agent", "high"),
  p("br.saved-passwords", "browser", "browser password store protected", "an unlocked browser store is every account at once.", "agent", "critical"),
  p("br.autofill-data", "browser", "autofill data reviewed", "autofill holds cards and addresses in cleartext-ish storage.", "agent", "medium"),
  p("br.cookie-scope", "browser", "third-party cookies restricted", "third-party cookies are cross-site tracking by definition.", "browser", "medium"),
  p("br.site-permissions", "browser", "site permission grants reviewed", "an old camera grant is a live camera grant.", "browser", "high"),
  p("br.service-workers", "browser", "service workers accounted for", "a service worker runs with no tab open.", "browser", "medium"),
  p("br.storage-footprint", "browser", "site storage footprint known", "large silent storage is a staging area.", "browser", "low"),
  p("br.notification-abuse", "browser", "notification permissions clean", "push permission is the modern adware channel.", "browser", "medium"),
  p("br.clipboard-access", "browser", "clipboard permission not standing", "a standing clipboard read captures every copied password.", "browser", "high"),
  p("br.screen-capture", "browser", "no standing screen capture grant", "a held display grant is a live screen recorder.", "browser", "critical"),
  p("br.geolocation-grant", "browser", "location grants reviewed", "a standing location grant follows you everywhere.", "browser", "high"),
  p("br.secure-context", "browser", "session running over https", "without tls nothing else in this list survives the network.", "browser", "critical"),
  p("br.mixed-content", "browser", "no mixed content on this page", "one plain resource breaks the whole page's guarantees.", "browser", "medium"),
  p("br.devtools-hooks", "browser", "no injected page hooks detected", "a rewritten fetch or xhr is an in-page interceptor.", "browser", "high"),
  p("br.tracker-blocking", "browser", "tracker beacons frozen", "beacons leave even when you never click.", "browser", "medium"),
  p("br.private-mode", "browser", "storage isolation understood", "private windows change what persists and what does not.", "browser", "low"),

  // ── extensions / plugins ──────────────────────────────────────────────
  p("ext.inventory", "extensions", "extension inventory complete", "you cannot judge what you have not listed.", "agent", "high"),
  p("ext.all-urls", "extensions", "no extension with all-urls access", "all-urls means it reads and rewrites every page you open.", "agent", "critical"),
  p("ext.webrequest", "extensions", "no extension intercepting requests", "request interception can read tokens in flight.", "agent", "critical"),
  p("ext.unpacked", "extensions", "no unpacked or sideloaded extension", "sideloaded extensions skip every store review.", "agent", "critical"),
  p("ext.recently-added", "extensions", "no unexplained new extension", "an extension you did not install is the whole finding.", "agent", "high"),
  p("ext.ownership-change", "extensions", "no extension ownership change", "sold extensions become adware overnight.", "agent", "high"),
  p("ext.native-messaging", "extensions", "no native messaging bridge", "native messaging lets a page talk to a local binary.", "agent", "critical"),
  p("ext.pdf-plugins", "extensions", "document plugins reviewed", "document handlers parse hostile input by design.", "agent", "medium"),
  p("ext.enterprise-policy", "extensions", "no unknown enterprise policy", "policy-installed extensions cannot be removed by the user.", "agent", "high"),

  // ── apps ──────────────────────────────────────────────────────────────
  p("app.inventory", "apps", "installed app inventory", "the app list is the attack surface list.", "agent", "high"),
  p("app.unsigned", "apps", "no unsigned applications", "an unsigned binary has no accountable author.", "agent", "high"),
  p("app.sideloaded", "apps", "no sideloaded packages", "sideloading is how stalkerware arrives on phones.", "agent", "critical"),
  p("app.known-stalkerware", "apps", "no known monitoring suite", "commercial monitoring suites are legal and hostile.", "agent", "critical"),
  p("app.remote-tools", "apps", "remote control tools reviewed", "support tools are attacker tools in the wrong hands.", "agent", "critical"),
  p("app.outdated", "apps", "no severely outdated apps", "old browsers and readers are the standard drive-by path.", "agent", "high"),
  p("app.permissions", "apps", "app permissions proportionate", "a torch app with microphone access is the finding.", "agent", "high"),
  p("app.recently-installed", "apps", "no unexplained new install", "install time is the fastest way to correlate an incident.", "agent", "medium"),
  p("app.store-origin", "apps", "install source known", "a package from a random domain has no chain of custody.", "agent", "medium"),
  p("app.crypto-miners", "apps", "no covert miner", "miners hide in idle cpu and blow the battery.", "agent", "high"),

  // ── processes ─────────────────────────────────────────────────────────
  p("proc.inventory", "processes", "running process inventory", "background processes are what actually run your device.", "agent", "high"),
  p("proc.background-hidden", "processes", "no hidden-window process", "a gui process with no window is hiding on purpose.", "agent", "critical"),
  p("proc.keylogger-pattern", "processes", "no input-hook process", "a global input hook is a keylogger by function.", "agent", "critical"),
  p("proc.screen-recorder", "processes", "no silent screen recorder", "screen capture with no visible surface is surveillance.", "agent", "critical"),
  p("proc.audio-capture", "processes", "no silent microphone client", "an open microphone stream with no call is the finding.", "agent", "critical"),
  p("proc.camera-capture", "processes", "no silent camera client", "the camera light is not a guarantee — the process list is better.", "both", "critical"),
  p("proc.autostart", "processes", "startup items reviewed", "persistence lives in autostart, not in the app window.", "agent", "high"),
  p("proc.scheduled-tasks", "processes", "scheduled tasks reviewed", "cron and task scheduler are the quietest persistence.", "agent", "high"),
  p("proc.launch-agents", "processes", "launch agents and services reviewed", "a service reinstalls whatever you deleted.", "agent", "high"),
  p("proc.cpu-anomaly", "processes", "no unexplained cpu burn", "sustained load with an idle user is someone else's work.", "agent", "medium"),
  p("proc.memory-anomaly", "processes", "no unexplained memory growth", "steady growth is either a leak or a collector.", "agent", "low"),
  p("proc.child-shells", "processes", "no shell spawned from a document app", "a shell under a document reader is exploitation.", "agent", "critical"),
  p("proc.debugger-attached", "processes", "no debugger attached to your session", "an attached debugger reads memory, keys included.", "agent", "high"),
  p("proc.injected-modules", "processes", "no foreign module injected", "dll and dylib injection is how sessions get hijacked.", "agent", "critical"),

  // ── accounts ──────────────────────────────────────────────────────────
  p("acct.admin-count", "accounts", "administrator accounts minimal", "every admin account is a full compromise path.", "agent", "high"),
  p("acct.unknown-users", "accounts", "no unknown local account", "an account you did not create is the intrusion.", "agent", "critical"),
  p("acct.autologin", "accounts", "automatic login off", "autologin turns theft of the device into theft of everything.", "agent", "high"),
  p("acct.screen-lock", "accounts", "screen lock enforced", "an unlocked idle screen is an open session.", "agent", "high"),
  p("acct.password-policy", "accounts", "login credential strength sane", "a four digit pin protects nothing meaningful.", "agent", "medium"),
  p("acct.mfa", "accounts", "second factor on this account", "a password alone is one phishing email from gone.", "both", "critical"),
  p("acct.ssh-authorized-keys", "accounts", "authorized_keys reviewed", "one extra public key is permanent remote access.", "agent", "critical"),
  p("acct.sudoers", "accounts", "sudoers rules reviewed", "a nopasswd rule quietly removes the last prompt.", "agent", "critical"),
  p("acct.session-count", "accounts", "no unexpected logged-in session", "a second live session is someone else using your device.", "agent", "critical"),
  p("acct.keychain-lock", "accounts", "credential store locked when idle", "an unlocked keychain is every saved secret.", "agent", "high"),

  // ── privacy ───────────────────────────────────────────────────────────
  p("priv.camera-grant", "privacy", "camera access inventory", "a grant you forgot is a camera someone remembers.", "both", "critical"),
  p("priv.mic-grant", "privacy", "microphone access inventory", "microphone grants outlive the reason you gave them.", "both", "critical"),
  p("priv.location-history", "privacy", "location services scoped", "background location is a movement log of your life.", "agent", "high"),
  p("priv.screen-recording-grant", "privacy", "screen recording grants scoped", "one grant records everything you look at.", "agent", "critical"),
  p("priv.accessibility-grant", "privacy", "accessibility permissions scoped", "accessibility access can read and control the whole ui.", "agent", "critical"),
  p("priv.input-monitoring", "privacy", "input monitoring grants scoped", "input monitoring is keylogging with a checkbox.", "agent", "critical"),
  p("priv.full-disk-grant", "privacy", "full disk access grants scoped", "full disk access reads mail, messages and backups.", "agent", "critical"),
  p("priv.telemetry", "privacy", "os telemetry level chosen", "default telemetry ships more than most people expect.", "agent", "low"),
  p("priv.ad-id", "privacy", "advertising identifier reset", "a stable ad id joins your activity across every app.", "agent", "low"),
  p("priv.clipboard-history", "privacy", "clipboard history bounded", "clipboard history keeps passwords long after use.", "agent", "medium"),

  // ── power ─────────────────────────────────────────────────────────────
  p("pwr.battery-level", "power", "battery percentage", "a device that dies mid-incident stops defending itself.", "both", "low"),
  p("pwr.battery-health", "power", "battery health", "a degraded cell is a shutdown you did not plan.", "agent", "low"),
  p("pwr.charging-state", "power", "charging state known", "unexpected discharge while plugged in is a load you did not start.", "both", "low"),
  p("pwr.drain-anomaly", "power", "no abnormal battery drain", "sudden drain is the oldest stalkerware symptom there is.", "agent", "high"),
  p("pwr.thermal", "power", "thermal state normal", "sustained heat at idle means something is running.", "agent", "medium"),
  p("pwr.charger-data", "power", "no data on the charging port", "a charging cable can carry data as well as power.", "agent", "high"),

  // ── updates ───────────────────────────────────────────────────────────
  p("upd.auto-update", "updates", "automatic updates enabled", "manual updating means never updating.", "agent", "high"),
  p("upd.pending-critical", "updates", "no pending critical updates", "the window between patch and install is the exploit window.", "agent", "critical"),
  p("upd.browser-current", "updates", "browser current", "the browser is the most attacked program on the device.", "both", "critical"),
  p("upd.firmware", "updates", "firmware current", "firmware bugs survive an os reinstall.", "agent", "high"),
  p("upd.antivirus-defs", "updates", "endpoint definitions current", "stale definitions catch last month's malware.", "agent", "high"),
  p("upd.reboot-pending", "updates", "no long-pending reboot", "patches that never load are patches you do not have.", "agent", "medium"),

  // ── peripherals ───────────────────────────────────────────────────────
  p("per.usb-inventory", "peripherals", "usb device inventory", "an unaccounted usb device is a physical implant candidate.", "agent", "high"),
  p("per.hid-duplicate", "peripherals", "no duplicate keyboard-class device", "a second keyboard nobody plugged in is a hardware keylogger.", "both", "critical"),
  p("per.mass-storage", "peripherals", "no unknown mass storage", "unknown storage is both exfil and delivery.", "agent", "high"),
  p("per.network-adapter", "peripherals", "no unexpected network adapter", "an extra nic can bridge your traffic somewhere else.", "agent", "high"),
  p("per.display-capture", "peripherals", "no unknown display sink", "an hdmi capture device records your screen with no software at all.", "agent", "high"),
  p("per.printer-scanner", "peripherals", "printers and scanners known", "network printers store what they print.", "agent", "low"),
  p("per.dock-firmware", "peripherals", "dock and hub firmware known", "docks sit between you and every cable.", "agent", "medium"),
  p("per.thunderbolt-dma", "peripherals", "dma protection on", "thunderbolt dma reads memory directly if unprotected.", "agent", "critical"),

  // ── surveillance ──────────────────────────────────────────────────────
  p("srv.covert-camera", "surveillance", "no covert camera use", "camera use with no visible preview is covert by definition.", "both", "critical"),
  p("srv.covert-mic", "surveillance", "no covert microphone use", "the same test applies to audio.", "both", "critical"),
  p("srv.remote-session", "surveillance", "no active remote session", "someone else's mouse on your desktop is the end of the audit.", "agent", "critical"),
  p("srv.mdm-profile", "surveillance", "device management profiles known", "an mdm profile grants remote control of the whole device.", "agent", "critical"),
  p("srv.config-profile", "surveillance", "no unknown configuration profile", "profiles can install roots, proxies and restrictions silently.", "agent", "critical"),
  p("srv.parental-controls", "surveillance", "no unexpected monitoring policy", "monitoring policies are invisible from inside the apps.", "agent", "high"),
  p("srv.beacon-tags", "surveillance", "no physical tracker in range", "physical tags follow the person, not the device.", "agent", "high"),
  p("srv.screen-share-active", "surveillance", "no active screen share", "a live share can outlast the meeting that started it.", "both", "critical"),

  // ── data ──────────────────────────────────────────────────────────────
  p("data.backup-recent", "data", "recent backup exists", "recovery is a security control, not an it chore.", "agent", "high"),
  p("data.backup-encrypted", "data", "backups encrypted", "an unencrypted backup is a copy of everything, unlocked.", "agent", "critical"),
  p("data.cloud-accounts", "data", "connected cloud accounts known", "a linked account is a door that does not touch your device.", "agent", "medium"),
  p("data.email-forwarding", "data", "no silent mail forwarding rule", "forwarding rules are the quietest persistent breach.", "agent", "critical"),
  p("data.token-storage", "data", "api tokens stored safely", "a token in a text file is a credential in every backup.", "agent", "high"),
  p("data.password-manager", "data", "password manager in use", "reuse is what turns one breach into all of them.", "agent", "high"),
  p("data.shared-folders", "data", "no unexpected file share", "an exported share is a network-visible copy of your disk.", "agent", "high"),
  p("data.printer-queue", "data", "no stale documents queued", "spooled documents sit unencrypted on disk.", "agent", "low"),

  // ── recovery ──────────────────────────────────────────────────────────
  p("rec.find-my", "recovery", "device locate enabled", "a lost device you cannot locate is a lost device you cannot wipe.", "agent", "high"),
  p("rec.remote-wipe", "recovery", "remote wipe available", "wipe is the last control you have over stolen hardware.", "agent", "high"),
  p("rec.incident-plan", "recovery", "incident steps recorded", "the worst time to decide what to do is during the incident.", "browser", "low"),
  p("rec.evidence-export", "recovery", "evidence export available", "a finding you cannot hand over is a finding nobody can act on.", "browser", "medium"),
];

export const CATEGORY_LABEL: Record<ProtectionCategory, string> = {
  device: "device and firmware",
  disk: "disk and volumes",
  files: "files and integrity",
  network: "network",
  wireless: "wifi",
  bluetooth: "bluetooth",
  browser: "browsers and tabs",
  extensions: "extensions and plugins",
  apps: "installed apps",
  processes: "running and background processes",
  accounts: "accounts and sessions",
  privacy: "permissions and privacy",
  power: "battery and power",
  updates: "updates",
  peripherals: "peripherals and usb",
  surveillance: "surveillance and remote control",
  data: "data, backups and credentials",
  recovery: "loss and recovery",
};

export const CATEGORY_ORDER: ProtectionCategory[] = [
  "device",
  "disk",
  "files",
  "network",
  "wireless",
  "bluetooth",
  "browser",
  "extensions",
  "apps",
  "processes",
  "accounts",
  "privacy",
  "power",
  "updates",
  "peripherals",
  "surveillance",
  "data",
  "recovery",
];

export const PROTECTION_BY_ID: Record<string, Protection> = Object.fromEntries(
  PROTECTIONS.map((x) => [x.id, x]),
);

export const PROTECTION_COUNT = PROTECTIONS.length;
export const BROWSER_MEASURABLE = PROTECTIONS.filter((x) => x.src !== "agent").length;
export const AGENT_MEASURABLE = PROTECTIONS.filter((x) => x.src !== "browser").length;
