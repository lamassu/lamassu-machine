// WARNING: This is an insecure protocol. This is only for use in test devices.

const packet = new Buffer([
  0xff, // Class
  0xca, // INS
  0x00, // P1: Get current card UID
  0x00, // P2
  0x00  // Le: Full Length of UID
]);
