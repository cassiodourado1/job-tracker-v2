#!/bin/bash
# Agenda o agente diário no macOS (launchd), no horário escolhido.
#
# Uso: scripts/instalar-agente-diario.sh [HORA] [META] [TETO]   (padrão: 9, 5 e 60)
#   META: quantas vagas forte ou boa encontrar por dia.
#   TETO: máximo de análises pagas por dia, para o crédito não zerar.
#      scripts/instalar-agente-diario.sh --remover
#
# Se o Mac estiver dormindo no horário, o launchd roda o agente quando ele
# acordar. O agente só fala com a API local e nunca envia candidatura.
set -euo pipefail

LABEL="local.job-tracker.agente-diario"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${1:-}" = "--remover" ]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Agente removido."
  exit 0
fi

HOUR="${1:-9}"
TOP="${2:-5}"
TETO="${3:-60}"
case "$HOUR" in ''|*[!0-9]*) echo "Hora inválida: $HOUR"; exit 1;; esac
case "$TOP" in ''|*[!0-9]*) echo "Meta inválida: $TOP"; exit 1;; esac
case "$TETO" in ''|*[!0-9]*) echo "Teto inválido: $TETO"; exit 1;; esac

NODE="$(command -v node)"
# O launchd não carrega o PATH do seu shell: sem isto, npm e node somem.
PATH_FOR_AGENT="$(dirname "$NODE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
mkdir -p "$HOME/agente-vagas" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/agente-diario.mjs</string>
    <string>--top</string><string>$TOP</string>
    <string>--teto</string><string>$TETO</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH_FOR_AGENT</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/agente-vagas/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/agente-vagas/launchd.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Agente agendado para as ${HOUR}h: procura $TOP vagas forte ou boa, com no máximo $TETO análises."
echo "O resultado aparece em Minhas vagas, Seleção do agente. Para remover: $0 --remover"
