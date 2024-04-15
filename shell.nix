with import (fetchTarball {
  name = "nixpkgs-19.03";
  url = https://github.com/NixOS/nixpkgs-channels/archive/69fabc286f745bca37a8cbead3665de31758e778.tar.gz;
  sha256 = "0mkqv8d4vh6r1b34n7ik0gpzqhf60sj1masd89jndlckvklqh69j";
}) {};


stdenv.mkDerivation {
    name = "node";
    buildInputs = [
      nodejs-6_x
      openssl_1_0_2
      python2Full
      entr
      libjpeg
      yasm
    ];
    shellHook = ''
        export PATH="$PWD/node_modules/.bin/:$PATH"
    '';
}
