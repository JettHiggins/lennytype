CREATE TABLE IF NOT EXISTS restart_votes (room TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, round INTEGER NOT NULL, PRIMARY KEY(room,player_id,round));
