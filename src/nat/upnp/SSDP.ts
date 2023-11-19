// deno-lint-ignore-file ban-untagged-todo
import dgram from "node:dgram";
import os from "node:os";
import { Buffer } from "node:buffer";
import { Device } from "./Device.ts";
import { EventEmitter, once } from "node:events";

const MULTICAST_IP_ADDRESS = "239.255.255.250";
const MULTICAST_PORT = 1900;

export default class Ssdp extends EventEmitter {
  multicast = MULTICAST_IP_ADDRESS;
  port = MULTICAST_PORT;

  sockets: dgram.Socket[] = [];
  _destroyed = false;
  _sourcePort = 0;
  _bound = false;
  _boundCount = 0;
  _queue: {
    action: "search";
    device: unknown;
    timeout: number;
  }[] = [];
  permanentFallback = false;

  constructor(opts: { sourcePort?: number; permanentFallback?: boolean } = {}) {
    super();

    this._sourcePort = opts.sourcePort || 0;
    this.permanentFallback = opts.permanentFallback || false;

    // Create sockets on all external interfaces
    this.createSockets();
  }

  createSockets(): void {
    if (this._destroyed) throw new Error("client is destroyed");

    const interfaces = os.networkInterfaces();

    this.sockets = [];
    for (const key in interfaces) {
      interfaces[key]?.filter((item) => {
        return !item.internal;
      }).forEach((item) => {
        this.createSocket(item);
      });
    }
  }

  async search(
    device: unknown,
    timeoutms: number,
  ): Promise<{ device: Device; address: string } | undefined> {
    if (this._destroyed) throw new Error("client is destroyed");

    await this._waitForBind();

    const query = Buffer.from(
      "M-SEARCH * HTTP/1.1\r\n" +
        "HOST: " + this.multicast + ":" + this.port + "\r\n" +
        'MAN: "ssdp:discover"\r\n' +
        "MX: 1\r\n" +
        "ST: " + device + "\r\n" +
        "\r\n",
    );

    const timeout = new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error("timeout");
        reject(err);
      }, timeoutms);
    });

    const event = once(this, "_device") as Promise<[Record<string, string>, string]>;

    this.sockets.forEach((socket) => {
      socket.send(query, 0, query.length, this.port, this.multicast);
    });

    // @ts-ignore: Weird TS error? TODO
    const [info, address] = await Promise.race([event, timeout]);

    if (info.st !== device) return;

    return {
      device: new Device({ url: info.location, permanentFallback: this.permanentFallback }),
      address,
    };
  }

  createSocket(interf: os.NetworkInterfaceInfo): void {
    if (this._destroyed) throw new Error("client is destroyed");

    let socket: dgram.Socket | null = dgram.createSocket(
      interf.family === "IPv4" ? "udp4" : "udp6",
    );

    socket.on("message", (message, _info) => {
      // Ignore messages after closing sockets
      if (this._destroyed) return;

      // Parse response
      // this._parseResponse(message.toString(), socket!.address, info)
      this._parseResponse(message.toString(), socket!.address().address);
    });

    // Unqueue this._queue once all sockets are ready
    const onReady = () => {
      if (this._boundCount < this.sockets.length) return;

      this._bound = true;
      this._queue.forEach((item) => {
        return this[item.action](item.device, item.timeout);
      });
    };

    socket.on("listening", () => {
      this._boundCount += 1;
      onReady();
    });

    const onClose = () => {
      if (socket) {
        const index = this.sockets.indexOf(socket);
        this.sockets.splice(index, 1);
        socket = null;
      }
    };

    // On error - remove socket from list and execute items from queue
    socket.on("close", () => {
      onClose();
    });
    socket.on("error", () => {
      // Ignore errors

      if (socket) {
        socket.close();
        // Force trigger onClose() - 'close()' does not guarantee to emit 'close'
        onClose();
      }

      onReady();
    });

    socket.bind(this._sourcePort, interf.address);
    this.sockets.push(socket);
  }

  // TODO create separate logic for parsing unsolicited upnp broadcasts,
  // if and when that need arises
  _parseResponse(response: string, addr: string): void {
    if (this._destroyed) return;

    // Ignore incorrect packets
    if (!/^(HTTP|NOTIFY)/m.test(response)) return;

    const headers = this._parseMimeHeader(response);

    // Messages that match the original search target
    if (!headers.st) return;

    this.emit("_device", headers, addr);
  }

  _parseMimeHeader(headerStr: string): Record<string, string> {
    if (this._destroyed) return {};

    const lines = headerStr.split(/\r\n/g);

    // Parse headers from lines to hashmap
    return lines.reduce<Record<string, string>>((headers, line) => {
      line.replace(/^([^:]*)\s*:\s*(.*)$/, (_a, key, value) => {
        headers[key.toLowerCase()] = value;
        return "";
      });
      return headers;
    }, {});
  }

  _waitForBind(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._bound) {
        const removeListeners = () => {
          this.sockets.forEach((socket) => {
            socket.removeListener("listening", resolveTrue);
          });
        };

        const resolveTrue = () => {
          clearTimeout(timeout);
          removeListeners();
          resolve();
        };
        const timeout = setTimeout(() => {
          removeListeners();
          reject(new Error("timeout"));
        }, 5000);

        this.sockets.forEach((socket) => {
          socket.on("listening", resolveTrue);
        });
      } else {
        resolve();
      }
    });
  }

  destroy(): Promise<PromiseSettledResult<void>[]> {
    this._destroyed = true;

    return Promise.allSettled(
      this.sockets.map((socket) => new Promise<void>((resolve) => socket.close(resolve))),
    );
  }
}
