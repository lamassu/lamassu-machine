with import (fetchTarball {
  name = "nixpkgs-194846768975b7ad2c4988bdb82572c00222c0d7";
  url = https://github.com/NixOS/nixpkgs/archive/194846768975b7ad2c4988bdb82572c00222c0d7.tar.gz;
  sha256 = "0snj72i9dm99jlnnmk8id8ffjnfg1k81lr7aw8d01kz3hdiraqil";
}) {};


stdenv.mkDerivation {
    name = "node";
    buildInputs = [
      nodejs_22
      openssl
      python3
      entr
      yasm
    ];
    shellHook = ''
        export PATH="$PWD/node_modules/.bin/:$PATH"
    '';
}