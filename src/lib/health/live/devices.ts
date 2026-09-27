// device contact layer for the headphone/wearable subsystem. every adapter here talks to a
// real browser api — web bluetooth gatt, devicemotion, or getUserMedia — and reports its own
// honest state. nothing here invents a sample: if no device answers, the adapter says so.
import { parseHeartRateValue, type HeartSample } from "../signals";

export type DeviceState = "available" | "unsupported" | "denied" | "not-connected" | "connected";

export interface AdapterStatus {
  id: string;
  label: string;
  state: DeviceState;
  reason: string;
  /** 0..1, derived only from real data characteristics (gaps, saturation, variance). null until data exists. */
  signalQuality: number | null;
  deviceName?: string;
}

type Listener<T> = (value: T) => void;

function secureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

/** small pub/sub so the panel can subscribe without polling. */
class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  emit(value: T): void {
    for (const l of this.listeners) l(value);
  }
  subscribe(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

// ---------------------------------------------------------------------------------------
// heart rate + battery + spo2 + temperature, all over standard ble gatt services.
// ---------------------------------------------------------------------------------------

export interface HeartFrame {
  bpm: number;
  rr: number[];
  at: number;
}

export interface BatteryFrame {
  percent: number;
  at: number;
}

export interface Spo2Frame {
  percent: number;
  pulseBpm: number | null;
  at: number;
}

export interface TemperatureFrame {
  celsius: number;
  at: number;
}

interface GattNavigator extends Navigator {
  bluetooth?: {
    requestDevice: (opts: { filters?: { services: string[] }[]; optionalServices?: string[] }) => Promise<BluetoothLike>;
  };
}

interface BluetoothRemoteCharacteristicLike {
  addEventListener: (type: "characteristicvaluechanged", handler: (event: Event) => void) => void;
  removeEventListener: (type: "characteristicvaluechanged", handler: (event: Event) => void) => void;
  startNotifications: () => Promise<void>;
  readValue?: () => Promise<DataView>;
}

interface BluetoothRemoteServiceLike {
  getCharacteristic: (uuid: string) => Promise<BluetoothRemoteCharacteristicLike>;
}

interface BluetoothRemoteServerLike {
  connected: boolean;
  connect: () => Promise<BluetoothRemoteServerLike>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<BluetoothRemoteServiceLike>;
}

interface BluetoothLike {
  name?: string;
  gatt?: BluetoothRemoteServerLike;
  addEventListener: (type: "gattserverdisconnected", handler: () => void) => void;
  removeEventListener: (type: "gattserverdisconnected", handler: () => void) => void;
}

function bluetoothApi(): GattNavigator["bluetooth"] | undefined {
  return (navigator as GattNavigator).bluetooth;
}

export function heartRateCapability(): AdapterStatus {
  const ble = !!bluetoothApi();
  const secure = secureContext();
  if (!secure) return { id: "heart-rate", label: "heart rate (ble)", state: "unsupported", reason: "bluetooth requires a secure connection (https).", signalQuality: null };
  if (!ble) return { id: "heart-rate", label: "heart rate (ble)", state: "unsupported", reason: "this browser does not expose web bluetooth.", signalQuality: null };
  return { id: "heart-rate", label: "heart rate (ble)", state: "not-connected", reason: "pair a device exposing the standard heart rate service.", signalQuality: null };
}

/** quality from real packet timing and rr plausibility only. */
function heartQuality(history: HeartFrame[]): number {
  if (history.length < 3) return 0.3;
  const recent = history.slice(-20);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i].at - recent[i - 1].at);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const gapVariance = gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length;
  const gapPenalty = Math.min(1, gapVariance / (meanGap * meanGap + 1));
  const rr = recent.flatMap((f) => f.rr);
  const plausible = rr.length === 0 ? 0.6 : rr.filter((v) => v > 300 && v < 2000).length / rr.length;
  return Math.max(0, Math.min(1, plausible * (1 - 0.5 * gapPenalty)));
}

export interface HeartExposure {
  connected: boolean;
  deviceName: string | null;
  rrIntervals: boolean;
  battery: boolean;
  spo2: boolean;
  temperature: boolean;
}

export class HeartRateAdapter {
  private device: BluetoothLike | null = null;
  private history: HeartFrame[] = [];
  readonly onHeart = new Emitter<HeartFrame>();
  readonly onBattery = new Emitter<BatteryFrame>();
  readonly onSpo2 = new Emitter<Spo2Frame>();
  readonly onTemperature = new Emitter<TemperatureFrame>();
  readonly onStatus = new Emitter<AdapterStatus>();
  private cleanups: (() => void)[] = [];
  private status: AdapterStatus = heartRateCapability();
  private exposedRr = false;
  private exposedBattery = false;
  private exposedSpo2 = false;
  private exposedTemperature = false;

  getStatus(): AdapterStatus {
    return this.status;
  }

  /** what this specific connected device actually exposed, discovered from real gatt responses only. */
  getExposure(): HeartExposure {
    return {
      connected: this.status.state === "connected",
      deviceName: this.status.deviceName ?? null,
      rrIntervals: this.exposedRr,
      battery: this.exposedBattery,
      spo2: this.exposedSpo2,
      temperature: this.exposedTemperature,
    };
  }

  private setStatus(next: Partial<AdapterStatus>): void {
    this.status = { ...this.status, ...next };
    this.onStatus.emit(this.status);
  }

  async connect(): Promise<void> {
    const bt = bluetoothApi();
    if (!bt) {
      this.setStatus({ state: "unsupported", reason: "web bluetooth is not available in this browser." });
      return;
    }
    try {
      const device = await bt.requestDevice({
        filters: [{ services: ["heart_rate"] }],
        optionalServices: ["battery_service", "0x1822", "0x1809", "pulse_oximeter", "health_thermometer"],
      });
      const server = await device.gatt!.connect();
      this.device = device;
      const disconnectHandler = () => {
        this.setStatus({ state: "not-connected", reason: "device disconnected.", deviceName: device.name });
      };
      device.addEventListener("gattserverdisconnected", disconnectHandler);
      this.cleanups.push(() => device.removeEventListener("gattserverdisconnected", disconnectHandler));

      await this.wireHeartRate(server);
      await this.wireBattery(server);
      await this.wireOptional(server, "pulse_oximeter", "0x2a5e", (view) => this.parseSpo2(view));
      await this.wireOptional(server, "health_thermometer", "0x2a1c", (view) => this.parseTemperature(view));

      this.setStatus({ state: "connected", reason: "receiving live packets.", deviceName: device.name || "heart rate device" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "connection failed.";
      this.setStatus({ state: message.toLowerCase().includes("permission") || message.toLowerCase().includes("cancel") ? "denied" : "not-connected", reason: message });
    }
  }

  private async wireHeartRate(server: BluetoothRemoteServerLike): Promise<void> {
    const service = await server.getPrimaryService("heart_rate");
    const characteristic = await service.getCharacteristic("heart_rate_measurement");
    const handler = (event: Event) => {
      const value = (event.target as unknown as { value: DataView }).value;
      if (!value) return;
      const sample: HeartSample = parseHeartRateValue(value);
      const frame: HeartFrame = { bpm: sample.bpm, rr: sample.rr, at: sample.at };
      if (frame.rr.length > 0) this.exposedRr = true;
      this.history.push(frame);
      if (this.history.length > 200) this.history.shift();
      this.onHeart.emit(frame);
      this.setStatus({ signalQuality: heartQuality(this.history) });
    };
    characteristic.addEventListener("characteristicvaluechanged", handler);
    await characteristic.startNotifications();
    this.cleanups.push(() => characteristic.removeEventListener("characteristicvaluechanged", handler));
  }

  private async wireBattery(server: BluetoothRemoteServerLike): Promise<void> {
    try {
      const service = await server.getPrimaryService("battery_service");
      const characteristic = await service.getCharacteristic("battery_level");
      if (characteristic.readValue) {
        const value = await characteristic.readValue();
        this.exposedBattery = true;
        this.onBattery.emit({ percent: value.getUint8(0), at: Date.now() });
      }
    } catch {
      /* battery service is optional; absence is not an error. */
    }
  }

  private async wireOptional(
    server: BluetoothRemoteServerLike,
    service: string,
    characteristicUuid: string,
    handle: (view: DataView) => void,
  ): Promise<void> {
    try {
      const svc = await server.getPrimaryService(service);
      const characteristic = await svc.getCharacteristic(characteristicUuid);
      const handler = (event: Event) => {
        const value = (event.target as unknown as { value: DataView }).value;
        if (value) handle(value);
      };
      characteristic.addEventListener("characteristicvaluechanged", handler);
      await characteristic.startNotifications();
      this.cleanups.push(() => characteristic.removeEventListener("characteristicvaluechanged", handler));
    } catch {
      /* this device does not expose the optional service — honestly absent, not simulated. */
    }
  }

  private parseSpo2(view: DataView): void {
    // ble plx spot-check measurement (0x2a5e): flags, spo2 (sfloat), pulse rate (sfloat).
    const spo2 = view.getUint16(1, true) & 0x0fff;
    const pulseRaw = view.byteLength > 3 ? view.getUint16(3, true) & 0x0fff : null;
    this.exposedSpo2 = true;
    this.onSpo2.emit({ percent: spo2 / 10, pulseBpm: pulseRaw ? pulseRaw / 10 : null, at: Date.now() });
  }

  private parseTemperature(view: DataView): void {
    // ble health thermometer measurement (0x2a1c): flags + ieee-11073 32-bit float.
    const raw = view.getInt32(1, true);
    const exponent = raw >> 24;
    const mantissa = raw & 0x00ffffff;
    const signedMantissa = mantissa & 0x800000 ? mantissa - 0x1000000 : mantissa;
    const celsius = signedMantissa * 10 ** exponent;
    this.exposedTemperature = true;
    this.onTemperature.emit({ celsius, at: Date.now() });
  }

  disconnect(): void {
    for (const c of this.cleanups.splice(0)) c();
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.history = [];
    this.exposedRr = false;
    this.exposedBattery = false;
    this.exposedSpo2 = false;
    this.exposedTemperature = false;
    this.setStatus({ state: "not-connected", reason: "disconnected.", signalQuality: null });
  }
}

// ---------------------------------------------------------------------------------------
// eeg over the muse ble gatt profile. real packets only — no headband, no data, no fallback.
// ---------------------------------------------------------------------------------------

export const MUSE_CONTROL_UUID = "273e0001-4c4d-454d-96be-f03bac821358";
export const MUSE_EEG_UUIDS = [
  "273e0003-4c4d-454d-96be-f03bac821358", // TP9
  "273e0004-4c4d-454d-96be-f03bac821358", // AF7
  "273e0005-4c4d-454d-96be-f03bac821358", // AF8
  "273e0006-4c4d-454d-96be-f03bac821358", // TP10
  "273e0007-4c4d-454d-96be-f03bac821358", // AUX
];
export const MUSE_CHANNEL_NAMES = ["TP9", "AF7", "AF8", "TP10", "AUX"];
export const MUSE_SERVICE_UUID = "273e0000-4c4d-454d-96be-f03bac821358";
const MUSE_SAMPLE_RATE_HZ = 256;

export interface EegPacket {
  channelIndex: number;
  channelName: string;
  sequence: number;
  /** 12 samples per notification, unpacked from 12-bit values to microvolts-scaled floats. */
  samples: number[];
  at: number;
}

/** unpack the muse 12-bit packed sample stream: 16-bit sequence header + 12 packed 12-bit samples. */
export function unpackMusePacket(view: DataView): { sequence: number; samples: number[] } {
  const sequence = view.getUint16(0, true);
  const samples: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (let byteIndex = 2; byteIndex < view.byteLength; byteIndex++) {
    bitBuffer = (bitBuffer << 8) | view.getUint8(byteIndex);
    bitCount += 8;
    if (bitCount >= 12) {
      bitCount -= 12;
      const raw = (bitBuffer >> bitCount) & 0x0fff;
      // muse encodes microvolts as (raw - 2048) * 0.48828125 (2000/4096 mV per 12-bit LSB is board-specific;
      // this is the widely documented muse scale factor).
      samples.push((raw - 2048) * 0.48828125);
    }
  }
  return { sequence, samples };
}

function eegQuality(packets: EegPacket[]): number {
  if (packets.length < 2) return 0.2;
  const recent = packets.slice(-20);
  let gapDrops = 0;
  for (let i = 1; i < recent.length; i++) {
    const expected = (recent[i - 1].sequence + 1) & 0xffff;
    if (recent[i].sequence !== expected) gapDrops++;
  }
  const allSamples = recent.flatMap((p) => p.samples);
  const saturated = allSamples.filter((v) => Math.abs(v) > 900).length / Math.max(1, allSamples.length);
  const mean = allSamples.reduce((a, b) => a + b, 0) / Math.max(1, allSamples.length);
  const variance = allSamples.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, allSamples.length);
  const flatline = variance < 0.5 ? 0.4 : 0;
  const gapPenalty = gapDrops / recent.length;
  return Math.max(0, Math.min(1, 1 - gapPenalty - saturated - flatline));
}

export function museCapability(): AdapterStatus {
  const ble = !!bluetoothApi();
  const secure = secureContext();
  if (!secure) return { id: "eeg", label: "eeg headband (muse-compatible)", state: "unsupported", reason: "bluetooth requires a secure connection.", signalQuality: null };
  if (!ble) return { id: "eeg", label: "eeg headband (muse-compatible)", state: "unsupported", reason: "this browser does not expose web bluetooth.", signalQuality: null };
  return { id: "eeg", label: "eeg headband (muse-compatible)", state: "not-connected", reason: "pair a muse-protocol eeg headband. no other eeg protocol is supported.", signalQuality: null };
}

export interface EegExposure {
  connected: boolean;
  deviceName: string | null;
  channelsSeen: string[];
}

export class MuseEegAdapter {
  private device: BluetoothLike | null = null;
  private packets: EegPacket[] = [];
  private channelsSeen: Set<string> = new Set();
  readonly onPacket = new Emitter<EegPacket>();
  readonly onStatus = new Emitter<AdapterStatus>();
  private cleanups: (() => void)[] = [];
  private status: AdapterStatus = museCapability();

  getStatus(): AdapterStatus {
    return this.status;
  }

  /** which of the muse channels have actually produced a packet this connection — not the theoretical five. */
  getExposure(): EegExposure {
    return { connected: this.status.state === "connected", deviceName: this.status.deviceName ?? null, channelsSeen: [...this.channelsSeen] };
  }
  private setStatus(next: Partial<AdapterStatus>): void {
    this.status = { ...this.status, ...next };
    this.onStatus.emit(this.status);
  }

  async connect(): Promise<void> {
    const bt = bluetoothApi();
    if (!bt) {
      this.setStatus({ state: "unsupported", reason: "web bluetooth is not available." });
      return;
    }
    try {
      const device = await bt.requestDevice({ filters: [{ services: [MUSE_SERVICE_UUID] }], optionalServices: [MUSE_CONTROL_UUID] });
      const server = await device.gatt!.connect();
      this.device = device;
      const disconnectHandler = () => this.setStatus({ state: "not-connected", reason: "headband disconnected." });
      device.addEventListener("gattserverdisconnected", disconnectHandler);
      this.cleanups.push(() => device.removeEventListener("gattserverdisconnected", disconnectHandler));

      const service = await server.getPrimaryService(MUSE_SERVICE_UUID);
      for (let i = 0; i < MUSE_EEG_UUIDS.length; i++) {
        const characteristic = await service.getCharacteristic(MUSE_EEG_UUIDS[i]);
        const channelIndex = i;
        const handler = (event: Event) => {
          const value = (event.target as unknown as { value: DataView }).value;
          if (!value) return;
          const { sequence, samples } = unpackMusePacket(value);
          const packet: EegPacket = { channelIndex, channelName: MUSE_CHANNEL_NAMES[channelIndex], sequence, samples, at: Date.now() };
          this.channelsSeen.add(packet.channelName);
          this.packets.push(packet);
          if (this.packets.length > 300) this.packets.shift();
          this.onPacket.emit(packet);
          this.setStatus({ signalQuality: eegQuality(this.packets) });
        };
        characteristic.addEventListener("characteristicvaluechanged", handler);
        await characteristic.startNotifications();
        this.cleanups.push(() => characteristic.removeEventListener("characteristicvaluechanged", handler));
      }
      this.setStatus({ state: "connected", reason: `streaming ${MUSE_SAMPLE_RATE_HZ} hz per channel.`, deviceName: device.name || "eeg headband" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "connection failed.";
      this.setStatus({ state: message.toLowerCase().includes("permission") || message.toLowerCase().includes("cancel") ? "denied" : "not-connected", reason: message });
    }
  }

  disconnect(): void {
    for (const c of this.cleanups.splice(0)) c();
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.device = null;
    this.packets = [];
    this.channelsSeen = new Set();
    this.setStatus({ state: "not-connected", reason: "disconnected.", signalQuality: null });
  }
}

// ---------------------------------------------------------------------------------------
// motion — devicemotion, with ios permission gate.
// ---------------------------------------------------------------------------------------

export interface MotionFrame {
  ax: number;
  ay: number;
  az: number;
  gx: number | null;
  gy: number | null;
  gz: number | null;
  at: number;
}

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function motionCapability(): AdapterStatus {
  const supported = typeof window !== "undefined" && "DeviceMotionEvent" in window;
  const secure = secureContext();
  if (!supported) return { id: "motion", label: "device motion", state: "unsupported", reason: "no motion sensor is exposed by this device or browser.", signalQuality: null };
  if (!secure) return { id: "motion", label: "device motion", state: "unsupported", reason: "motion sensing requires a secure connection.", signalQuality: null };
  return { id: "motion", label: "device motion", state: "not-connected", reason: "grant motion access to begin sampling.", signalQuality: null };
}

function motionQuality(frames: MotionFrame[]): number {
  if (frames.length < 10) return 0.3;
  const recent = frames.slice(-50);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i].at - recent[i - 1].at);
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const dropouts = gaps.filter((g) => g > meanGap * 4).length;
  const saturated = recent.filter((f) => Math.abs(f.ax) > 78 || Math.abs(f.ay) > 78 || Math.abs(f.az) > 78).length;
  return Math.max(0, Math.min(1, 1 - dropouts / recent.length - saturated / recent.length));
}

export interface MotionExposure {
  connected: boolean;
  rotationRate: boolean;
}

export class MotionAdapter {
  private frames: MotionFrame[] = [];
  readonly onFrame = new Emitter<MotionFrame>();
  readonly onStatus = new Emitter<AdapterStatus>();
  private status: AdapterStatus = motionCapability();
  private handler: ((event: DeviceMotionEvent) => void) | null = null;
  private exposedRotation = false;

  getStatus(): AdapterStatus {
    return this.status;
  }

  getExposure(): MotionExposure {
    return { connected: this.status.state === "connected", rotationRate: this.exposedRotation };
  }
  private setStatus(next: Partial<AdapterStatus>): void {
    this.status = { ...this.status, ...next };
    this.onStatus.emit(this.status);
  }

  async connect(): Promise<void> {
    if (this.status.state === "unsupported") return;
    const ctor = (window as unknown as { DeviceMotionEvent?: DeviceMotionEventWithPermission & (new () => DeviceMotionEvent) }).DeviceMotionEvent;
    try {
      if (ctor && typeof ctor.requestPermission === "function") {
        const result = await ctor.requestPermission();
        if (result !== "granted") {
          this.setStatus({ state: "denied", reason: "motion permission was not granted." });
          return;
        }
      }
      this.handler = (event: DeviceMotionEvent) => {
        const acc = event.accelerationIncludingGravity ?? event.acceleration;
        if (!acc || acc.x === null) return;
        const rotation = event.rotationRate;
        const frame: MotionFrame = {
          ax: acc.x ?? 0,
          ay: acc.y ?? 0,
          az: acc.z ?? 0,
          gx: rotation?.alpha ?? null,
          gy: rotation?.beta ?? null,
          gz: rotation?.gamma ?? null,
          at: Date.now(),
        };
        if (frame.gx !== null || frame.gy !== null || frame.gz !== null) this.exposedRotation = true;
        this.frames.push(frame);
        if (this.frames.length > 500) this.frames.shift();
        this.onFrame.emit(frame);
        this.setStatus({ signalQuality: motionQuality(this.frames) });
      };
      window.addEventListener("devicemotion", this.handler);
      this.setStatus({ state: "connected", reason: "sampling at the device's native rate.", deviceName: "built-in motion sensor" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "motion permission request failed.";
      this.setStatus({ state: "denied", reason: message });
    }
  }

  disconnect(): void {
    if (this.handler) window.removeEventListener("devicemotion", this.handler);
    this.handler = null;
    this.frames = [];
    this.exposedRotation = false;
    this.setStatus({ state: "not-connected", reason: "disconnected.", signalQuality: null });
  }
}

// ---------------------------------------------------------------------------------------
// acoustics — microphone through an analysernode. real spectra only.
// ---------------------------------------------------------------------------------------

export interface AudioFrame {
  frequencyDb: Float32Array;
  timeDomain: Float32Array;
  sampleRate: number;
  at: number;
}

export function audioCapability(): AdapterStatus {
  const media = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const secure = secureContext();
  if (!secure) return { id: "audio", label: "microphone (acoustics)", state: "unsupported", reason: "microphone access requires a secure connection.", signalQuality: null };
  if (!media) return { id: "audio", label: "microphone (acoustics)", state: "unsupported", reason: "this browser does not expose microphone access.", signalQuality: null };
  return { id: "audio", label: "microphone (acoustics)", state: "not-connected", reason: "grant microphone access to measure breathing and ambient noise.", signalQuality: null };
}

function audioQuality(frames: AudioFrame[]): number {
  if (frames.length < 2) return 0.3;
  const last = frames[frames.length - 1];
  const clipped = last.timeDomain.filter((v) => Math.abs(v) > 0.98).length / last.timeDomain.length;
  const silent = last.timeDomain.every((v) => v === 0);
  return silent ? 0.1 : Math.max(0, 1 - clipped * 3);
}

export interface AudioExposure {
  connected: boolean;
  sampleRate: number | null;
}

export class AudioAdapter {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private raf: number | null = null;
  private frames: AudioFrame[] = [];
  readonly onFrame = new Emitter<AudioFrame>();
  readonly onStatus = new Emitter<AdapterStatus>();
  private status: AdapterStatus = audioCapability();

  getStatus(): AdapterStatus {
    return this.status;
  }

  getExposure(): AudioExposure {
    return { connected: this.status.state === "connected", sampleRate: this.frames.length ? this.frames[this.frames.length - 1].sampleRate : null };
  }
  private setStatus(next: Partial<AdapterStatus>): void {
    this.status = { ...this.status, ...next };
    this.onStatus.emit(this.status);
  }

  async connect(): Promise<void> {
    if (this.status.state === "unsupported") return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new AudioCtx();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source.connect(this.analyser);
      const freqBuf = new Float32Array(this.analyser.frequencyBinCount);
      const timeBuf = new Float32Array(this.analyser.fftSize);
      const tick = () => {
        if (!this.analyser || !this.context) return;
        this.analyser.getFloatFrequencyData(freqBuf);
        this.analyser.getFloatTimeDomainData(timeBuf);
        const frame: AudioFrame = { frequencyDb: freqBuf.slice(), timeDomain: timeBuf.slice(), sampleRate: this.context.sampleRate, at: Date.now() };
        this.frames.push(frame);
        if (this.frames.length > 30) this.frames.shift();
        this.onFrame.emit(frame);
        this.setStatus({ signalQuality: audioQuality(this.frames) });
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
      this.setStatus({ state: "connected", reason: "analysing live microphone input.", deviceName: "microphone" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "microphone access failed.";
      this.setStatus({ state: message.toLowerCase().includes("denied") || message.toLowerCase().includes("permission") ? "denied" : "not-connected", reason: message });
    }
  }

  disconnect(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.frames = [];
    this.setStatus({ state: "not-connected", reason: "disconnected.", signalQuality: null });
  }
}

// ---------------------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------------------

export type AdapterId = "heart-rate" | "eeg" | "motion" | "audio";

export interface DeviceRegistry {
  heart: HeartRateAdapter;
  eeg: MuseEegAdapter;
  motion: MotionAdapter;
  audio: AudioAdapter;
}

export function createDeviceRegistry(): DeviceRegistry {
  return {
    heart: new HeartRateAdapter(),
    eeg: new MuseEegAdapter(),
    motion: new MotionAdapter(),
    audio: new AudioAdapter(),
  };
}

export function disconnectAll(registry: DeviceRegistry): void {
  registry.heart.disconnect();
  registry.eeg.disconnect();
  registry.motion.disconnect();
  registry.audio.disconnect();
}
