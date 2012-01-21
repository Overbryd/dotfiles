tell application "Address Book"
  do shell script "git config --global user.name '" & the name of my card & "'"
  do shell script "git config --global user.email '" & the value of the first email of my card & "'"
end tell
