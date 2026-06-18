#!/bin/sh
set -eu

SENTINEL="/__ark_base_path__"
TARGET="${ARK_DASHBOARD_BASE_PATH:-}"

if [ "$TARGET" = "$SENTINEL" ]; then
  echo "entrypoint: ARK_DASHBOARD_BASE_PATH equals the sentinel; nothing to do"
elif [ "$TARGET" = "/" ]; then
  echo "entrypoint: ARK_DASHBOARD_BASE_PATH=/ collapses to empty"
  TARGET=""
fi

case "$TARGET" in
  ''|/*) ;;
  *)
    echo "entrypoint: ARK_DASHBOARD_BASE_PATH must start with '/' (got '$TARGET')" >&2
    exit 1
    ;;
esac

export SENTINEL TARGET

SUBBED=$(perl -MFile::Find -e '
    my $s = $ENV{SENTINEL};
    my $t = $ENV{TARGET};
    my %exts = map { $_ => 1 } qw(js map rsc json html);
    my $n = 0;
    my $rewrite_file = sub {
      my ($path) = @_;
      open my $fh, "<", $path or return;
      my $c = do { local $/; <$fh> };
      close $fh;
      return unless index($c, $s) >= 0;
      $c =~ s/\Q$s\E/$t/g;
      open my $out, ">", $path or return;
      print $out $c;
      close $out;
      $n++;
    };
    # no_chdir keeps the cwd fixed at the start dir so relative paths in
    # $File::Find::name resolve correctly when passed to open().
    find({
      no_chdir => 1,
      wanted => sub {
        return unless -f $File::Find::name;
        my ($ext) = $File::Find::name =~ /\.([^.]+)$/ or return;
        return unless $exts{lc $ext};
        $rewrite_file->($File::Find::name);
      },
    }, ".next");
    # server.js lives at the standalone root, outside .next/
    $rewrite_file->("server.js") if -f "server.js";
    print $n;
  ')

echo "entrypoint: substituted '$SENTINEL' -> '$TARGET' in $SUBBED file(s)"

RESIDUAL=$( {
    grep -rl "$SENTINEL" \
      --include='*.js' --include='*.map' --include='*.rsc' \
      --include='*.json' --include='*.html' \
      .next 2>/dev/null
    grep -l "$SENTINEL" server.js 2>/dev/null
  } | wc -l | tr -d ' ')

if [ "$RESIDUAL" != "0" ]; then
  echo "entrypoint: ERROR: sentinel still present in $RESIDUAL file(s) after substitution" >&2
  exit 1
fi

exec node server.js
