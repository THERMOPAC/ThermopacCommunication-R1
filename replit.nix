{pkgs}: {
  deps = [
    pkgs.expat
    pkgs.nspr
    pkgs.nss
    pkgs.chromium
    pkgs.jq
    pkgs.postgresql
  ];
}
