with import (fetchTarball {
  name = "nixpkgs-19.03";
  url = https://github.com/NixOS/nixpkgs-channels/archive/f52505fac8c82716872a616c501ad9eff188f97f.tar.gz;
  sha256 = "0q2m2qhyga9yq29yz90ywgjbn9hdahs7i8wwlq7b55rdbyiwa5dy";
}) {};


stdenv.mkDerivation {
    name = "node";
    buildInputs = [
      nodejs-8_x
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
