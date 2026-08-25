#!/bin/sh
set -eu

home="${PAPERCLIP_HOME:-/paperclip}"
revision="$(cat /opt/ai-cli/SOURCE_REVISION)"
version="$(cat /opt/ai-cli/VERSION)"
expected_revision="${AI_CLI_SOURCE_REVISION:?AI_CLI_SOURCE_REVISION is required}"
image_digest="${AI_CLI_IMAGE_DIGEST:?AI_CLI_IMAGE_DIGEST is required}"

if [ "$revision" != "$expected_revision" ]; then
  echo "ai-cli seed refused: image revision does not match AI_CLI_SOURCE_REVISION" >&2
  exit 1
fi

root="$home/.local/lib/ai-cli"
release="$root/$revision"
stage="$root/.stage-$revision-$$"
umask 022
mkdir -p "$root" "$home/.local/bin"

if [ "${AI_CLI_SEED_ACTION:-install}" = "remove" ]; then
  remove_link() {
    target=$1
    link=$2
    backup="$link.pre-ai-cli"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
      rm "$link"
    fi
    if [ ! -e "$link" ] && [ ! -L "$link" ] && { [ -e "$backup" ] || [ -L "$backup" ]; }; then
      mv "$backup" "$link"
    fi
  }
  remove_link "$release/dist/index.js" "$home/.local/bin/ai"
  for projection in \
    "$home/.pi/agent/skills/ai-cli" \
    "$home/.claude/skills/ai-cli" \
    "$home/.codex/skills/ai-cli"
  do
    remove_link "$release/skill" "$projection"
  done
  rm -rf "$release"
  rm -f "$root/.installed"
  exit 0
fi

if [ "${AI_CLI_SEED_ACTION:-install}" != "install" ]; then
  echo "ai-cli seed refused: AI_CLI_SEED_ACTION must be install or remove" >&2
  exit 1
fi

if [ ! -f "$release/SOURCE_REVISION" ]; then
  rm -rf "$stage"
  mkdir -p "$stage/dist" "$stage/skill"
  cp -R /opt/ai-cli/dist/. "$stage/dist/"
  cp -R /opt/ai-cli/skill/. "$stage/skill/"
  cp /opt/ai-cli/LICENSE "$stage/LICENSE"
  cp /opt/ai-cli/package.json "$stage/package.json"
  cp /opt/ai-cli/SOURCE_REVISION "$stage/SOURCE_REVISION"
  cp /opt/ai-cli/VERSION "$stage/VERSION"
  chmod -R a-w "$stage"
  chmod a+rx "$stage/dist/index.js"
  mv "$stage" "$release"
fi

if [ "$(cat "$release/SOURCE_REVISION")" != "$revision" ]; then
  echo "ai-cli seed refused: existing release has unexpected provenance" >&2
  exit 1
fi

atomic_link() {
  target=$1
  link=$2
  parent=$(dirname "$link")
  backup="$link.pre-ai-cli"
  tmp="$link.tmp.$$"
  mkdir -p "$parent"
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    if [ -e "$backup" ] || [ -L "$backup" ]; then
      echo "ai-cli seed refused: both $link and its backup exist" >&2
      exit 1
    fi
    mv "$link" "$backup"
  fi
  rm -f "$tmp"
  ln -s "$target" "$tmp"
  mv -Tf "$tmp" "$link"
}

atomic_link "$release/dist/index.js" "$home/.local/bin/ai"
for projection in \
  "$home/.pi/agent/skills/ai-cli" \
  "$home/.claude/skills/ai-cli" \
  "$home/.codex/skills/ai-cli"
do
  atomic_link "$release/skill" "$projection"
done

marker="$root/.installed.tmp.$$"
printf 'version=%s\nrevision=%s\nimage=%s\n' \
  "$version" "$revision" "$image_digest" > "$marker"
mv -f "$marker" "$root/.installed"
