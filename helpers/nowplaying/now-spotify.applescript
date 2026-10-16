-- The Spotify app: one tab-separated line when something plays.
set tab to (ASCII character 9)
try
	tell application "Spotify"
		if player state is playing then
			set t to current track
			return "spotify" & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & ((duration of t) / 1000) & tab & (player position) & tab & (spotify url of t)
		end if
	end tell
on error e
	return "err" & tab & "Spotify" & tab & e
end try
return ""
