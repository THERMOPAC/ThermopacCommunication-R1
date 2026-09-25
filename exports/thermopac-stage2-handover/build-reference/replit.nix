{pkgs}: {
  deps = [
    pkgs.glibcLocales
    pkgs.which
    pkgs.poppler_utils
    pkgs.zlib
    pkgs.python312
    pkgs.chromium
  ];
}
