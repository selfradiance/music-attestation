#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
node_path="$(command -v node || true)"

if [[ -z "$node_path" ]]; then
  echo "Could not find node on PATH." >&2
  exit 1
fi

if [[ ! -x /usr/bin/osacompile ]]; then
  echo "Could not find /usr/bin/osacompile." >&2
  exit 1
fi

escape_applescript_string() {
  printf '%s' "$1" | /usr/bin/sed 's/\\/\\\\/g; s/"/\\"/g'
}

repo_root_escaped="$(escape_applescript_string "$repo_root")"
node_path_escaped="$(escape_applescript_string "$node_path")"
tmp_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/music-attestation-droplets.XXXXXX")"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

seal_source="$tmp_dir/Seal Track.applescript"
verify_source="$tmp_dir/Verify Track.applescript"

cat > "$seal_source" <<APPLESCRIPT
property repoRoot : "$repo_root_escaped"
property nodePath : "$node_path_escaped"

on open droppedItems
  if (count of droppedItems) is not 1 then
    display dialog "Drop exactly one audio file onto Seal Track." buttons {"OK"} default button "OK" with icon caution
    return
  end if

  set audioPath to POSIX path of (item 1 of droppedItems)
  set titleResponse to display dialog "Track title:" default answer "" buttons {"Cancel", "Seal"} default button "Seal" cancel button "Cancel"
  set trackTitle to text returned of titleResponse

  if trackTitle is "" then
    display dialog "Track title cannot be empty." buttons {"OK"} default button "OK" with icon caution
    return
  end if

  try
    set dialogText to my sealTrack(audioPath, trackTitle)
    display dialog dialogText buttons {"OK"} default button "OK" with title "Seal Track"
  on error errText
    display dialog errText buttons {"OK"} default button "OK" with title "Seal Track Failed" with icon stop
  end try
end open

on run argv
  if (count of argv) is 2 then
    return my sealTrack(item 1 of argv, item 2 of argv)
  end if

  display dialog "Drop one audio file onto Seal Track." buttons {"OK"} default button "OK" with title "Seal Track"
end run

on sealTrack(audioPath, trackTitle)
  set commandText to "cd " & quoted form of repoRoot & " && " & quoted form of nodePath & " " & quoted form of (repoRoot & "/seal.mjs") & " " & quoted form of audioPath & " " & quoted form of trackTitle & " 2>&1"

  try
    set commandOutput to do shell script commandText
  on error errText
    error "Sealing failed:" & linefeed & errText
  end try

  set shaValue to my valueAfterPrefix(commandOutput, "SHA-256: ")
  set sealedDate to my valueAfterPrefix(commandOutput, "Date: ")

  if shaValue is "" then
    error "Sealing failed: seal.mjs did not print a SHA-256 value." & linefeed & commandOutput
  end if

  if sealedDate is "" then
    error "Sealing failed: seal.mjs did not print a sealed date." & linefeed & commandOutput
  end if

  set shortSha to shaValue
  if (length of shaValue) is greater than 12 then
    set shortSha to text 1 thru 12 of shaValue
  end if

  return "Sealed: " & trackTitle & linefeed & "SHA-256: " & shortSha & linefeed & "Date: " & sealedDate
end sealTrack

on valueAfterPrefix(outputText, prefixText)
  repeat with outputLine in paragraphs of outputText
    set lineText to outputLine as text
    if lineText starts with prefixText then
      if (length of lineText) is equal to (length of prefixText) then
        return ""
      end if
      return text ((length of prefixText) + 1) thru -1 of lineText
    end if
  end repeat

  return ""
end valueAfterPrefix
APPLESCRIPT

cat > "$verify_source" <<APPLESCRIPT
property repoRoot : "$repo_root_escaped"
property nodePath : "$node_path_escaped"

on open droppedItems
  if (count of droppedItems) is not 1 then
    display dialog "Drop exactly one audio file onto Verify Track." buttons {"OK"} default button "OK" with icon caution
    return
  end if

  set audioPath to POSIX path of (item 1 of droppedItems)

  try
    set dialogText to my verifyTrack(audioPath)
    display dialog dialogText buttons {"OK"} default button "OK" with title "Verify Track"
  on error errText
    display dialog errText buttons {"OK"} default button "OK" with title "Verify Track Failed" with icon stop
  end try
end open

on run argv
  if (count of argv) is 1 then
    return my verifyTrack(item 1 of argv)
  end if

  display dialog "Drop one audio file onto Verify Track." buttons {"OK"} default button "OK" with title "Verify Track"
end run

on verifyTrack(audioPath)
  set commandText to "cd " & quoted form of repoRoot & " && " & quoted form of nodePath & " " & quoted form of (repoRoot & "/verify.mjs") & " " & quoted form of audioPath & " 2>&1"

  try
    set commandOutput to do shell script commandText
  on error errText
    return my verificationMessage(errText)
  end try

  return my verificationMessage(commandOutput)
end verifyTrack

on verificationMessage(outputText)
  set statusText to "FAIL"
  set sealedDate to "unknown"

  repeat with outputLine in paragraphs of outputText
    set lineText to outputLine as text
    if lineText starts with "PASS sealed date: " then
      set statusText to "PASS"
      set sealedDate to text 19 thru -1 of lineText
      exit repeat
    else if lineText starts with "FAIL sealed date: " then
      set statusText to "FAIL"
      set sealedDate to text 19 thru -1 of lineText
      exit repeat
    end if
  end repeat

  set messageText to statusText & linefeed & "Sealed date: " & sealedDate

  if statusText is "FAIL" then
    set messageText to messageText & linefeed & linefeed & outputText
  end if

  return messageText
end verificationMessage
APPLESCRIPT

rm -rf "$repo_root/Seal Track.app" "$repo_root/Verify Track.app"
/usr/bin/osacompile -o "$repo_root/Seal Track.app" "$seal_source"
/usr/bin/osacompile -o "$repo_root/Verify Track.app" "$verify_source"

echo "Built Seal Track.app with node: $node_path"
echo "Built Verify Track.app with node: $node_path"
