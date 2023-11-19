// import { parse } from "https://deno.land/x/xml@2.1.3/mod.ts";
// import type { document } from "https://deno.land/x/xml@2.1.3/utils/types.ts";

export const ERROR_MESSAGES = {
  606: "Action not authorized",
  714: "The specified value does not exist in the array",
  715: "The source IP address cannot be wild-carded",
  716: "The external port cannot be wild-carded",
  718:
    "The port mapping entry specified conflicts with a mapping assigned previously to another client",
  724: "Internal and External port values MUST be the same",
  725: "The NAT implementation only supports permanent lease times on port mappings",
  726: "RemoteHost must be a wildcard and cannot be a specific IP address or DNS name",
  727: "ExternalPort MUST be a wildcard and cannot be a specific port value",
  728: "There are not enough free ports available to complete port mapping",
  729: "Attempted port mapping is not allowed due to conflict with other mechanisms",
  732: "The internal port cannot be wild-carded",
};

export type DeviceOptions = {
  url: string;
  permanentFallback?: boolean;
};

export class Device {
  url: string;
  permanentFallback: boolean;
  services: string[];

  constructor(opts: DeviceOptions) {
    this.url = opts.url;
    this.permanentFallback = opts.permanentFallback || false;
    this.services = [
      "urn:schemas-upnp-org:service:WANIPConnection:1",
      "urn:schemas-upnp-org:service:WANIPConnection:2",
      "urn:schemas-upnp-org:service:WANPPPConnection:1",
    ];
  }
}
