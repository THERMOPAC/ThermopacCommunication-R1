{pkgs}: {
  deps = [
    pkgs.python312Packages.scipy
    pkgs.python312Packages.numpy
    pkgs.expat
    pkgs.nspr
    pkgs.nss
    pkgs.chromium
    pkgs.jq
    pkgs.postgresql
  ];
}
