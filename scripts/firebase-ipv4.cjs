/**
 * Firebase CLI wrapper: forces IPv4 DNS resolution.
 * This machine resolves Google APIs to IPv6 first and the IPv6 route is dead,
 * which makes undici calls fail with ETIMEDOUT / AggregateError.
 */
const dns = require("dns");

const originalLookup = dns.lookup;
dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  const opts = Object.assign({}, options, { family: 4 });
  return originalLookup.call(dns, hostname, opts, callback);
};

const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = function lookup(hostname, options) {
  const opts = Object.assign({}, options, { family: 4 });
  return originalPromisesLookup.call(dns.promises, hostname, opts);
};

dns.setDefaultResultOrder("ipv4first");

process.argv = [process.argv[0], "firebase", ...process.argv.slice(2)];
require("firebase-tools/lib/bin/firebase.js");
