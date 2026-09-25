# Inactive candidate. See production-nix-candidate.md before any adoption.
{ pkgs }: {
  deps = [
    pkgs.python312
    pkgs.stdenv.cc.cc.lib
    pkgs.zlib
    pkgs.chromium
    pkgs.poppler_utils
    pkgs.which
    # Conservative hold pending isolated locale/report verification.
    pkgs.glibcLocales
  ];
}