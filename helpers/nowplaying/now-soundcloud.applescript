-- The SoundCloud desktop app is the website in a window; its title carries the same play glyph.
-- Reading window titles goes through System Events, which macOS gates behind Accessibility.
set tab to (ASCII character 9)
set play to (character id 9654)
set out to ""
try
	tell application "System Events"
		repeat with w in windows of process "SoundCloud"
			set ti to name of w
			if ti starts with play then
				set out to out & "soundcloud" & tab & ti & tab & "" & tab & "" & tab & "" & tab & "" & tab & "" & linefeed
			end if
		end repeat
	end tell
on error e
	return "err" & tab & "SoundCloud" & tab & e
end try
return out
