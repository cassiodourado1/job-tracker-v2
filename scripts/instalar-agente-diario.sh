#!/bin/bash
# Agenda o agente diário no macOS (launchd), no horário escolhido.
#
# Uso: scripts/instalar-agente-diario.sh [HORA] [VAGAS]   (padrão: 9 e 10)
#   VAGAS: quantas vagas novas pôr na Seleção do agente por dia.
#      scripts/instalar-agente-diario.sh --remover
#
# O agendamento roda SEMPRE sem IA: nenhuma chamada paga à Anthropic. Este
# instalador não aceita --com-ia de propósito; análise paga é só quando você
# pede, no app ou rodando o agente à mão com --com-ia.
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
TOP="${2:-10}"
if [ -n "${3:-}" ]; then
  echo "O agendamento roda sem IA e não aceita um terceiro argumento (o antigo TETO)."
  exit 1
fi
case "$HOUR" in ''|*[!0-9]*) echo "Hora inválida: $HOUR"; exit 1;; esac
case "$TOP" in ''|*[!0-9]*) echo "Quantidade de vagas inválida: $TOP"; exit 1;; esac

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
echo "Agente agendado para as ${HOUR}h, sem IA: até $TOP vagas novas por dia na Seleção do agente."
echo "O resultado aparece em Minhas vagas, Seleção do agente. Para remover: $0 --remover"
