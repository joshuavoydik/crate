-- Apple Music (the Music app): one tab-separated line when something plays.
set tab to (ASCII character 9)
try
	tell application "Music"
		if player state is playing then
			set t to current track
			return "apple" & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & (player position) & tab & ""
		end if
	end tell
on error e
	return "err" & tab & "Music" & tab & e
end try
return ""
