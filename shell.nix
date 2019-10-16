with import <nixpkgs> {};

stdenv.mkDerivation {
    name = "node";
    buildInputs = [
      nodejs-8_x
      openssl_1_0_2
      python2Full
      entr
    ];
    shellHook = ''
        export PATH="$PWD/node_modules/.bin/:$PATH"
    '';
}
