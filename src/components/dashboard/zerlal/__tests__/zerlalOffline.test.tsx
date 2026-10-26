import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import KernelOfflineNotice from "../KernelOfflineNotice";
import PortScannerUI from "../PortScannerUI";
import CertTransparencyMonitor from "../CertTransparencyMonitor";
import WhoisTimeline from "../WhoisTimeline";
import TorExitNodeChecker from "../TorExitNodeChecker";
import PathMapScreen from "../PathMapScreen";
import GhostChainScanner from "../GhostChainScanner";
import DomainReconScreen from "../DomainReconScreen";

afterEach(cleanup);

describe("KernelOfflineNotice", () => {
  it("renders the capability and reason it is given, in one honest line", () => {
    const { getByText } = render(
      <KernelOfflineNotice capability="port scanning" reason="a browser cannot open raw tcp sockets." />,
    );
    expect(getByText(/port scanning ran on the asherin kernel and is not part of the local edition\./i)).toBeTruthy();
    expect(getByText(/a browser cannot open raw tcp sockets\./i)).toBeTruthy();
  });
});

// Each offline screen must say plainly that the capability ran on the kernel,
// and must NOT fabricate a result (no hashed ports, certs, whois rows, ip
// verdicts) or claim a scan completed.
const offlineScreens: Array<[string, () => JSX.Element]> = [
  ["port scanner", () => <PortScannerUI />],
  ["certificate transparency", () => <CertTransparencyMonitor />],
  ["whois timeline", () => <WhoisTimeline />],
  ["tor / vpn checker", () => <TorExitNodeChecker />],
  ["path map", () => <PathMapScreen />],
  ["ghostchain", () => <GhostChainScanner />],
  ["domain recon", () => <DomainReconScreen />],
];

describe("offline zerlal screens are honest, not fabricated", () => {
  for (const [name, El] of offlineScreens) {
    it(`${name} states it ran on the kernel and shows no fabricated result`, () => {
      const { container } = render(<El />);
      const text = container.textContent || "";
      expect(text).toMatch(/ran on the asherin kernel and is not part of the local edition/i);
      // no fabricated-result vocabulary from the old hash generators
      expect(text).not.toMatch(/Suspicious|typosquat|Tor Exit Node|Residential IP|Open Proxy|REDACTED FOR PRIVACY/);
      expect(text).not.toMatch(/scan complete/i);
    });
  }
});
