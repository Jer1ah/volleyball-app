"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Modal, Input, Radio, Button, message } from "antd";
import Image from "next/image";
import { SearchOutlined, PlusOutlined, DeleteOutlined, SettingOutlined, EditOutlined } from "@ant-design/icons";
import { getAppData, addPlayer, updatePlayerName, removePlayer, submitMatch, deleteMatchAction } from "./actions";

import crownIcon from "./assets/crown.png";
import './app.css';

// ─── ELO LOGIC ────────────────────────────────────────────────────────────────
const K_FACTOR = 32;

const calculateNewRatings = (teamA: any[], teamB: any[], scoreA: number, scoreB: number) => {
  const avgA = teamA.reduce((s, p) => s + p.elo, 0) / teamA.length;
  const avgB = teamB.reduce((s, p) => s + p.elo, 0) / teamB.length;
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const actualA = scoreA > scoreB ? 1 : 0;
  const mov = Math.log(Math.abs(scoreA - scoreB) + 1) * (2.2 / ((actualA === 1 ? avgA - avgB : avgB - avgA) * 0.001 + 2.2));
  return Math.round(K_FACTOR * mov * (actualA - expectedA));
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const getRank = (elo: number) => {
  if (elo >= 1750) return { label: "Champion", color: "#FF3E3E" };
  if (elo >= 1400) return { label: "Diamond", color: "#00F5FF" };
  if (elo >= 1250) return { label: "Platinum", color: "#BF5AF2" };
  if (elo >= 1100) return { label: "Gold", color: "#FFD700" };
  if (elo >= 950) return { label: "Silver", color: "#A8B2C1" };
  return { label: "Bronze", color: "#CD7F32" };
};

const Pill = ({ label, color }: { label: string; color: string }) => (
  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 800, background: `${color}20`, color, border: `1px solid ${color}50` }}>{label}</span>
);

export default function EloTracker() {
  const [players, setPlayers] = useState<any>([]);
  const [matches, setMatches] = useState<any[]>([]); 
  const [tab, setTab] = useState("ranks"); 
  const [loading, setLoading] = useState(false);
  
  // Modals & Search
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");

  // Match State
  const [matchType, setMatchType] = useState(2); 
  const [teamA, setTeamA] = useState<any[]>([]);
  const [teamB, setTeamB] = useState<any[]>([]);
  const [scoreA, setScoreA] = useState<any>(undefined);
  const [scoreB, setScoreB] = useState<any>(undefined);
  
  // New Player State
  const [newName, setNewName] = useState("");

  const refreshData = async () => {
    const data = await getAppData();
    setPlayers(data.players);
    
    // Map Database Matches to UI Format
    const formattedMatches = data.matches.map((m: any) => ({
      id: m.id,
      date: new Date(m.matchDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      teamANames: m.participants.filter((p: any) => p.team === 'A').map((p: any) => p.player.name).join('/'),
      teamBNames: m.participants.filter((p: any) => p.team === 'B').map((p: any) => p.player.name).join('/'),
      score: `${m.scoreA}-${m.scoreB}`,
      winner: m.scoreA > m.scoreB ? "Blue" : "Gold",
      type: m.matchType
    }));
    setMatches(formattedMatches);
  };

  // Initial Data Load
  useEffect(() => {
     
    refreshData();
  }, []);

  const handleAddPlayer = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await addPlayer(newName.trim());
      setNewName("");
      setIsPlayerModalOpen(false);
      await refreshData();
    } catch (err) {
      console.error("Action failed:", err);
      alert("Connection error. Check the terminal!");
    } finally {
      setLoading(false); // This ensures the button stops spinning no matter what
    }
  };

  const handleDeletePlayer = async (id: number) => {
    await removePlayer(id);
    await refreshData();
  };

  const handleUpdateName = async (id: number, name: string) => {
    await updatePlayerName(id, name);
    // Silent update to UI for smoothness
    setPlayers(players.map((p: any) => p.id === id ? { ...p, name } : p));
  };

  const handleDeleteMatch = async (id: number) => {
    // Note: Reversing ELO on match delete is complex with DB. 
    // For now, this simply removes the record.
    await deleteMatchAction(id); 
    await refreshData();
  };

  const handleMatchSubmit = async () => {
    if (teamA.length === 0 || teamB.length === 0 || scoreA === undefined || scoreB === undefined || scoreA === scoreB) {
        message.error("Please select players and enter a valid score.");
        return;
    }

    setLoading(true);
    const shift = calculateNewRatings(teamA, teamB, scoreA, scoreB);
    
    // Calculate new ELOs for the database update
    const updatedPlayersList = players.map((p: any) => {
      const isA = teamA.find((t: any) => t.id === p.id);
      const isB = teamB.find((t: any) => t.id === p.id);
      if (!isA && !isB) return null;
      
      const won = (isA && scoreA > scoreB) || (isB && scoreB > scoreA);
      const change = isA ? shift : -shift;
      
      return {
        id: p.id,
        elo: p.elo + change,
        wins: won ? p.wins + 1 : p.wins,
        losses: won ? p.losses : p.losses + 1
      };
    }).filter(Boolean);

    const matchData = {
      scoreA,
      scoreB,
      type: matchType === 2 ? "Doubles" : "Triples",
      participants: [
        ...teamA.map(p => ({ id: p.id, team: 'A' })),
        ...teamB.map(p => ({ id: p.id, team: 'B' }))
      ]
    };

    await submitMatch(matchData, updatedPlayersList);
    
    // Reset and Refresh
    setTeamA([]); setTeamB([]); setScoreA(undefined); setScoreB(undefined);
    setIsMatchModalOpen(false);
    await refreshData();
    setLoading(false);
  };

  const togglePlayerSelection = (p: any) => {
    if (teamA.find((x: any) => x.id === p.id)) setTeamA(teamA.filter((x: any) => x.id !== p.id));
    else if (teamB.find((x: any) => x.id === p.id)) setTeamB(teamB.filter((x: any) => x.id !== p.id));
    else if (teamA.length < matchType) setTeamA([...teamA, p]);
    else if (teamB.length < matchType) setTeamB([...teamB, p]);
  };

  const filteredPlayers = players.filter((p: any) => 
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", background: "#0D1117", color: "#E6EDF3", fontFamily: "sans-serif", minHeight: '100vh' }}>
      <style>{`
        .btn { padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .tab-btn { flex: 1; padding: 14px; background: transparent; color: #8B949E; border: none; border-bottom: 2px solid #30363D; cursor: pointer; font-weight: bold; }
        .tab-active { color: #5C7CFA; border-bottom: 2px solid #5C7CFA; }
        .card { background: #161B22; border: 1px solid #30363D; border-radius: 12px; padding: 16px; margin: 10px; }
        .dark-modal .ant-modal-content { background: #161B22; color: white; border: 1px solid #30363D; }
        .dark-modal .ant-modal-header { background: #161B22; border-bottom: 1px solid #30363D; }
        .dark-modal .ant-modal-title { color: white; }
        .dark-input { background: #0D1117 !important; border: 1px solid #30363D !important; color: white !important; }
        .player-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 150px; overflow-y: auto; padding: 10px; background: #0D1117; border-radius: 8px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src={crownIcon} width={24} height={24} alt="Crown" />
          <h2 style={{ margin: 0, letterSpacing: 1 }}>
              <span style={{ color: "#5C7CFA", fontWeight: 500 }}>CLT</span><span style={{ color: "#339AF0", fontWeight: 400 }}>Volleyball</span>
          </h2>
        </div>
        <SettingOutlined onClick={() => setIsSettingsModalOpen(true)} style={{ fontSize: '22px', cursor: 'pointer', color: '#8B949E' }} />
      </div>

      <div style={{ display: "flex" }}>
        <button className={`tab-btn ${tab === "ranks" ? "tab-active" : ""}`} onClick={() => setTab("ranks")}>RANKINGS</button>
        <button className={`tab-btn ${tab === "log" ? "tab-active" : ""}`} onClick={() => setTab("log")}>MATCH LOG</button>
      </div>

      <div>
        {tab === "ranks" ? (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => setIsPlayerModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA' }}>Add New Player</Button>
            </div>
            {players.map((p: any, i: number) => (
                <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: "bold", color: "#484F58", minWidth: '25px' }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#8B949E" }}>{p.wins}W - {p.losses}L</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>{p.elo}</div>
                    <Pill label={getRank(p.elo).label} color={getRank(p.elo).color} />
                  </div>
                </div>
            ))}
          </>
        ) : (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block icon={<PlusOutlined />} onClick={() => setIsMatchModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA' }}>Add Match Entry</Button>
            </div>
            {matches.map(m => (
                <div key={m.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#8B949E" }}>{m.date} • {m.type}</span>
                      <button onClick={() => handleDeleteMatch(m.id)} style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 10 }}>Delete</button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, fontSize: 13 }}>
                          <div style={{ color: m.winner === "Blue" ? "#5C7CFA" : "white", fontWeight: m.winner === "Blue" ? "bold" : "normal" }}>{m.teamANames}</div>
                          <div style={{ margin: '4px 0', color: '#484F58', fontSize: 10 }}>vs</div>
                          <div style={{ color: m.winner === "Gold" ? "#FFBE0B" : "white", fontWeight: m.winner === "Gold" ? "bold" : "normal" }}>{m.teamBNames}</div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: "bold", color: "#E6EDF3" }}>{m.score}</div>
                  </div>
                </div>
            ))}
          </>
        )}
      </div>

      {/* Modals remain largely the same, just calling handle functions */}
      <Modal title="Create Player" open={isPlayerModalOpen} onOk={handleAddPlayer} onCancel={() => setIsPlayerModalOpen(false)} confirmLoading={loading} className="dark-modal">
        <Input placeholder="Player Name" value={newName} onChange={e => setNewName(e.target.value)} className="dark-input" />
      </Modal>

      <Modal title="Manage Players" open={isSettingsModalOpen} footer={null} onCancel={() => setIsSettingsModalOpen(false)} className="dark-modal">
        {players.map((p: any) => (
            <div key={p.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <Input value={p.name} onChange={e => handleUpdateName(p.id, e.target.value)} className="dark-input" prefix={<EditOutlined />} />
                <Button danger icon={<DeleteOutlined />} onClick={() => handleDeletePlayer(p.id)} />
            </div>
        ))}
      </Modal>

      <Modal title="Record Match" open={isMatchModalOpen} onOk={handleMatchSubmit} confirmLoading={loading} onCancel={() => setIsMatchModalOpen(false)} className="dark-modal" width={400}>
        <Radio.Group value={matchType} onChange={e => { setMatchType(e.target.value); setTeamA([]); setTeamB([]); }} style={{ marginBottom: 15 }} optionType="button">
            <Radio value={2}>Doubles</Radio>
            <Radio value={3}>Triples</Radio>
        </Radio.Group>
        <Input prefix={<SearchOutlined />} placeholder="Search players..." value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} className="dark-input" style={{ marginBottom: 10 }} />
        <div className="player-grid">
            {filteredPlayers.map((p: any) => (
                <button key={p.id} onClick={() => togglePlayerSelection(p)} className="btn" style={{ background: teamA.find(x => x.id === p.id) ? "#5C7CFA" : teamB.find(x => x.id === p.id) ? "#FFBE0B" : "#21262D", color: "white", fontSize: 11 }}>
                    {p.name}
                </button>
            ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 15 }}>
            <div style={{ border: '1px solid #5C7CFA', padding: 8, borderRadius: 8 }}>
                <div style={{ color: '#5C7CFA', fontSize: 10, fontWeight: 'bold' }}>BLUE</div>
                <Input type="number" placeholder="Score" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value))} className="dark-input" />
            </div>
            <div style={{ border: '1px solid #FFBE0B', padding: 8, borderRadius: 8 }}>
                <div style={{ color: '#FFBE0B', fontSize: 10, fontWeight: 'bold' }}>GOLD</div>
                <Input type="number" placeholder="Score" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value))} className="dark-input" />
            </div>
        </div>
      </Modal>
    </div>
  );
}
