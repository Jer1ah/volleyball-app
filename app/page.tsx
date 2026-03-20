"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { Modal, Input, Radio, Button, message, Popconfirm, Space, Divider, Tag } from "antd";
import Image from "next/image";
import { SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined, ThunderboltOutlined, SwapOutlined } from "@ant-design/icons";
import { getAppData, addPlayer, updatePlayerName, removePlayer, submitMatch, deleteMatchAction } from "./actions";

import volleyballIcon from "./assets/volleyball.png";
import plusMinusIcon from "./assets/plus-minus.png";
import './app.css';

// ─── ELO LOGIC ────────────────────────────────────────────────────────────────
const K_FACTOR = 64;
const calculateNewRatings = (teamA: any[], teamB: any[], scoreA: number, scoreB: number) => {
  if (!teamA.length || !teamB.length) return 0;
  const avgA = teamA.reduce((s, p) => s + (p?.elo || 1000), 0) / teamA.length;
  const avgB = teamB.reduce((s, p) => s + (p?.elo || 1000), 0) / teamB.length;
  
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const actualA = scoreA > scoreB ? 1 : 0;
  
  const mov = Math.log(Math.abs(scoreA - scoreB) + 1) * (2.2 / ((actualA === 1 ? avgA - avgB : avgB - avgA) * 0.001 + 2.2));
  
  return Math.abs(Math.round(K_FACTOR * mov * (actualA - expectedA)));
};

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

// ─── MATCH GENERATION LOGIC ───────────────────────────────────────────────────

// Shuffle array (Fisher-Yates)
const shuffleArray = (arr: any[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Generate all combinations of k items from array
const getCombinations = (arr: any[], k: number): any[][] => {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map((combo: any[]) => [first, ...combo]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
};

const avgElo = (team: any[]) => team.reduce((s, p) => s + (p?.elo || 1000), 0) / team.length;

// Find the most balanced split of `players` into two teams of `teamSize`
const generateFairMatch = (players: any[], teamSize: number): { teamA: any[]; teamB: any[] } => {
  const combos = getCombinations(players, teamSize);
  let bestA: any[] = [];
  let bestB: any[] = [];
  let bestDiff = Infinity;

  for (const combo of combos) {
    const rest = players.filter((p: any) => !combo.find((c: any) => c.id === p.id));
    if (rest.length !== teamSize) continue;
    const diff = Math.abs(avgElo(combo) - avgElo(rest));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestA = combo;
      bestB = rest;
    }
  }

  return { teamA: bestA, teamB: bestB };
};

// Random split into two teams of `teamSize`
const generateRandomMatch = (players: any[], teamSize: number): { teamA: any[]; teamB: any[] } => {
  const shuffled = shuffleArray(players);
  return { teamA: shuffled.slice(0, teamSize), teamB: shuffled.slice(teamSize, teamSize * 2) };
};

export default function EloTracker() {
  const [players, setPlayers] = useState<any>([]);
  const [matches, setMatches] = useState<any[]>([]); 
  const [tab, setTab] = useState("ranks"); 
  const [loading, setLoading] = useState(false);
  
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tempName, setTempName] = useState("");
  const [newName, setNewName] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");

  const [matchType, setMatchType] = useState(2); 
  const [teamA, setTeamA] = useState<any[]>([]);
  const [teamB, setTeamB] = useState<any[]>([]);
  const [scoreA, setScoreA] = useState<any>(undefined);
  const [scoreB, setScoreB] = useState<any>(undefined);

  // ─── GENERATE TAB STATE ───────────────────────────────────────────────────
  const [genMatchType, setGenMatchType] = useState(2);
  const [genSelected, setGenSelected] = useState<any[]>([]);
  const [genResult, setGenResult] = useState<{ teamA: any[]; teamB: any[] } | null>(null);
  const [genMode, setGenMode] = useState<"random" | "fair">("fair");
  const [genSearch, setGenSearch] = useState("");
  const [isGenResultModalOpen, setIsGenResultModalOpen] = useState(false);

  const refreshData = async () => {
    const data = await getAppData();
    setPlayers(data.players);
    const formattedMatches = data.matches.map((m: any) => ({
      id: m.id,
      date: new Date(m.matchDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      teamANames: m.participants.filter((p: any) => p.team === 'A').map((p: any) => p.player.name).join('/'),
      teamBNames: m.participants.filter((p: any) => p.team === 'B').map((p: any) => p.player.name).join('/'),
      score: `${m.scoreA}-${m.scoreB}`,
      winner: m.scoreA > m.scoreB ? "Blue" : "Gold",
      type: m.matchType,
      eloShift: m.eloShift,
    }));
    setMatches(formattedMatches);
  };

  useEffect(() => { refreshData(); }, []);

  const handleAddPlayer = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await addPlayer(newName.trim());
      setNewName("");
      refreshData();
      message.success("Player added!");
    } catch (err) { message.error("Failed to add player."); }
    finally { setLoading(false); }
  };

  const handleUpdateName = async (id: number) => {
    if (!tempName.trim()) return;
    await updatePlayerName(id, tempName.trim());
    setEditingId(null);
    refreshData();
    message.success("Name updated");
  };

  const handleDeletePlayer = async (id: number) => {
    await removePlayer(id);
    refreshData();
    message.success("Player removed");
  };

  const handleDeleteMatch = async (id: number) => {
    await deleteMatchAction(id); 
    refreshData();
    message.success("Match deleted");
  };

  const handleMatchSubmit = async () => {
    if (teamA.length === 0 || teamB.length === 0 || scoreA === undefined || scoreB === undefined) {
        message.error("Invalid match data.");
        return;
    }
    setLoading(true);

    const shift = calculateNewRatings(teamA, teamB, scoreA, scoreB);

    const updatedPlayersList = players.map((p: any) => {
      const isA = teamA.find((t: any) => t.id === p.id);
      const isB = teamB.find((t: any) => t.id === p.id);
      
      if (!isA && !isB) return null;

      const teamAWon = scoreA > scoreB;
      const teamBWon = scoreB > scoreA;
      const isPlayerWinner = (isA && teamAWon) || (isB && teamBWon);

      const playerEloAdjustment = isPlayerWinner ? shift : -shift;

      return { 
        id: p.id, 
        elo: p.elo + playerEloAdjustment, 
        wins: isPlayerWinner ? p.wins + 1 : p.wins, 
        losses: isPlayerWinner ? p.losses : p.losses + 1 
      };
    }).filter(Boolean);

    await submitMatch(
      { 
        scoreA, 
        scoreB, 
        type: matchType === 2 ? "Doubles" : "Triples", 
        participants: [
          ...teamA.map(p => ({ id: p.id, team: 'A' })), 
          ...teamB.map(p => ({ id: p.id, team: 'B' }))
        ] 
      }, 
      updatedPlayersList, 
      shift
    );

    setTeamA([]); setTeamB([]); setScoreA(undefined); setScoreB(undefined);
    setIsMatchModalOpen(false);
    refreshData();
    setLoading(false);
    setPlayerSearch('');
  };

  const togglePlayerSelection = (p: any) => {
    if (teamA.find((x: any) => x.id === p.id)) {
        setTeamA(teamA.filter((x: any) => x.id !== p.id));
        return;
    }
    if (teamB.find((x: any) => x.id === p.id)) {
        setTeamB(teamB.filter((x: any) => x.id !== p.id));
        return;
    }
    if (teamA.length < matchType) {
        setTeamA([...teamA, p]);
    } else if (teamB.length < matchType) {
        setTeamB([...teamB, p]);
    } else {
        message.warning("Teams are full!");
    }
  };

  const removeFromTeam = (id: number, team: 'A' | 'B') => {
      if (team === 'A') setTeamA(teamA.filter(p => p.id !== id));
      else setTeamB(teamB.filter(p => p.id !== id));
  };

  const availablePlayers = players.filter((p: any) => 
    !teamA.some(a => a.id === p.id) && !teamB.some(b => b.id === p.id) &&
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );

  // ─── GENERATE TAB HANDLERS ────────────────────────────────────────────────
  const toggleGenPlayer = (p: any) => {
    if (genSelected.find((x: any) => x.id === p.id)) {
      setGenSelected(genSelected.filter((x: any) => x.id !== p.id));
    } else {
      setGenSelected([...genSelected, p]);
    }
  };

  const requiredPlayers = genMatchType * 2;

  const handleGenerate = () => {
    if (genSelected.length < requiredPlayers) {
      message.warning(`Select at least ${requiredPlayers} players for ${genMatchType}v${genMatchType}.`);
      return;
    }
    // Randomly pick `requiredPlayers` from the selected pool first
    const pool = shuffleArray(genSelected).slice(0, requiredPlayers);
    const result = genMode === "fair"
      ? generateFairMatch(pool, genMatchType)
      : generateRandomMatch(pool, genMatchType);
    setGenResult(result);
    setIsGenResultModalOpen(true);
  };

  const filteredGenPlayers = players.filter((p: any) =>
    p.name.toLowerCase().includes(genSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", background: "#0D1117", color: "#E6EDF3", fontFamily: "sans-serif", minHeight: '100vh' }}>
      <style>{`
        .btn { padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .tab-btn { flex: 1; padding: 14px; background: transparent; color: #8B949E; border: none; border-bottom: 2px solid #30363D; cursor: pointer; font-weight: bold; font-size: 12px; }
        .tab-active { color: #5C7CFA; border-bottom: 2px solid #5C7CFA; }
        .card { background: #161B22; border: 1px solid #30363D; border-radius: 12px; padding: 16px; margin: 10px; }
        .dark-modal .ant-modal-content { background: #161B22; color: white; border: 1px solid #30363D; }
        .dark-modal .ant-modal-header { background: #161B22; border-bottom: 1px solid #30363D; }
        .dark-modal .ant-modal-title { color: white; }
        .dark-input { background: #0D1117 !important; border: 1px solid #30363D !important; color: white !important; }
        .player-grid { display: flex; flex-wrap: wrap; gap: 8px; max-height: 99px; overflow-y: auto; padding: 12px; background: #0D1117; border-radius: 8px; border: 1px solid #30363D; }
        .manage-item { display: flex; align-items: center; justify-content: space-between; padding: 8px; background: #0D1117; border-radius: 8px; margin-bottom: 8px; border: 1px solid #30363D; }
        .team-selection-area { background: #161B22; padding: 12px; border-radius: 10px; border: 1px solid #30363D; margin-bottom: 15px; }
        .team-label { font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 8px; }
        .gen-player-btn { padding: 8px 14px; border-radius: 8px; border: 1px solid #30363D; background: #21262D; color: #E6EDF3; cursor: pointer; font-size: 12px; font-weight: 600; transition: all 0.15s; }
        .gen-player-btn:hover { border-color: #5C7CFA; }
        .gen-player-btn.selected { background: #5C7CFA20; border-color: #5C7CFA; color: #5C7CFA; }
        .gen-player-btn.selected-full { background: #30363D; border-color: #30363D; color: #484F58; cursor: not-allowed; }
        .gen-mode-btn { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #30363D; background: #21262D; color: #8B949E; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.15s; letter-spacing: 0.5px; }
        .gen-mode-btn.active-random { background: #FF6B6B18; border-color: #FF6B6B; color: #FF6B6B; }
        .gen-mode-btn.active-fair { background: #4ADE8018; border-color: #4ADE80; color: #4ADE80; }
        .gen-result-card { border-radius: 12px; padding: 16px; margin-top: 16px; border: 1px solid #30363D; background: #0D1117; animation: fadeSlideIn 0.3s ease; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .gen-team-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
        .fairness-bar-bg { height: 6px; border-radius: 99px; background: #21262D; overflow: hidden; margin-top: 6px; }
        .fairness-bar-fill { height: 100%; border-radius: 99px; transition: width 0.4s ease; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Image src={volleyballIcon} width={24} height={24} alt="Volleyball" />
          <h2 style={{ margin: 0, letterSpacing: 1, marginLeft: '-4px' }}>
              <span style={{ color: "#5C7CFA", fontWeight: 500 }}>VOLLEY</span><span style={{ color: "#339AF0", fontWeight: 400 }}>ELO</span>
          </h2>
        </div>
      </div>

      <div style={{ display: "flex" }}>
        <button className={`tab-btn ${tab === "ranks" ? "tab-active" : ""}`} onClick={() => {setTab("ranks"); setGenSelected([]);}}>RANKINGS</button>
        <button className={`tab-btn ${tab === "log" ? "tab-active" : ""}`} onClick={() => {setTab("log"); setGenSelected([]);}}>MATCH LOG</button>
        <button className={`tab-btn ${tab === "generate" ? "tab-active" : ""}`} onClick={() => {setTab("generate"); setGenSelected([]);}}>GENERATE MATCH</button>
      </div>

      <div>
        {tab === "ranks" ? (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block onClick={() => setIsManageModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA', marginTop: '10px' }}>Manage Players</Button>
            </div>
            <div className="player-rank-list">
              {players.map((p: any, i: number) => (
                  <div key={p.id} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: "bold", color: "#484F58", minWidth: '25px' }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "bold" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#8B949E" }}>{p.wins}-{p.losses}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: "bold", color: "white", marginRight: 2 }}>{p.elo}</div>
                      <Pill label={getRank(p.elo).label} color={getRank(p.elo).color} />
                    </div>
                  </div>
              ))}
            </div>
          </>
        ) : tab === "log" ? (
          <>
            <div style={{ padding: '10px' }}>
              <Button type="primary" block onClick={() => setIsMatchModalOpen(true)} style={{ height: '45px', borderRadius: '8px', background: '#5C7CFA', marginTop: '10px' }}>Add Match Entry</Button>
            </div>
            <div className="matches-list">
              {matches.map(m => (
                <div key={m.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#8B949E" }}>{m.date} • {m.type}</span>
                    <Popconfirm
                      title="Delete match?"
                      description="This reverts player stats."
                      onConfirm={() => handleDeleteMatch(m.id)}
                      okText="Delete"
                      cancelText="Cancel"
                      placement="left"
                      okButtonProps={{ style: { background: '#5C7CFA' } }}
                      cancelButtonProps={{ style: { background: 'black', borderColor: 'white', color: 'white' } }}
                    >
                      <button style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 10 }}>Delete</button>
                    </Popconfirm>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, fontSize: 13 }}>
                      <div style={{ color: m.winner === "Blue" ? "#5C7CFA" : "white", fontWeight: m.winner === "Blue" ? "bold" : "normal" }}>{m.teamANames}</div>
                      <div style={{ margin: '4px 0', color: '#484F58', fontSize: 10 }}>vs</div>
                      <div style={{ color: m.winner === "Gold" ? "#FFBE0B" : "white", fontWeight: m.winner === "Gold" ? "bold" : "normal" }}>{m.teamBNames}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: "bold", color: "#E6EDF3" }}>{m.score}</div>
                      <span style={{ fontSize: 11, fontWeight: 300, color: "#8B949E", display: "flex", alignItems: "center"}}>
                        <Image height={14} style={{ marginTop: '2px', marginRight: '1px' }} src={plusMinusIcon} alt="Elo Shift Icon" />
                        {m.eloShift}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          // ─── GENERATE TAB ──────────────────────────────────────────────────
          <div style={{ padding: '10px' }}>

            {/* Match Type */}
            <div className="card" style={{ margin: '10px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#8B949E', marginBottom: 10 }}>MATCH TYPE</div>
              <Radio.Group
                value={genMatchType}
                onChange={e => { setGenMatchType(e.target.value); setGenSelected([]); setGenResult(null); }}
                optionType="button"
                className="add-match-radio-group"
                style={{ width: '100%' }}
              >
                <Radio value={2}>Doubles</Radio>
                <Radio value={3}>Triples</Radio>
              </Radio.Group>
            </div>

            {/* Mode Selection */}
            <div className="card" style={{ margin: '10px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#8B949E', marginBottom: 10 }}>GENERATION MODE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`gen-mode-btn ${genMode === 'fair' ? 'active-fair' : ''}`}
                  onClick={() => { setGenMode('fair'); setGenResult(null); }}
                >
                  BALANCED
                </button>
                <button
                  className={`gen-mode-btn ${genMode === 'random' ? 'active-random' : ''}`}
                  onClick={() => { setGenMode('random'); setGenResult(null); }}
                >
                  RANDOM
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#484F58', marginTop: 8 }}>
                {genMode === 'fair'
                  ? 'Splits players to minimize the ELO difference between teams.'
                  : 'Assigns players to teams completely at random.'}
              </div>
            </div>

            {/* Player Selection */}
            <div className="card" style={{ margin: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: '#8B949E' }}>SELECT PLAYERS</div>
                <div style={{ fontSize: 11, color: genSelected.length >= requiredPlayers ? '#4ADE80' : '#8B949E' }}>
                  {genSelected.length} selected · need {requiredPlayers}+
                </div>
              </div>

              <Input
                autoFocus={false}
                prefix={<SearchOutlined style={{ color: '#484F58' }} />}
                placeholder="Search players..."
                value={genSearch}
                onChange={e => setGenSearch(e.target.value)}
                className="dark-input"
                style={{ marginBottom: 10 }}
              />

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                maxHeight: 130,
                overflowY: 'auto',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
              }}>
                {filteredGenPlayers.map((p: any) => {
                  const isSelected = !!genSelected.find((x: any) => x.id === p.id);
                  return (
                    <button
                      key={p.id}
                      className={`gen-player-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        toggleGenPlayer(p);
                        setGenSearch('');
                      }}
                    >
                      {p.name}
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>{p.elo}</span>
                    </button>
                  );
                })}
                {filteredGenPlayers.length === 0 && (
                  <div style={{ color: '#484F58', fontSize: 12, padding: '8px 0' }}>No players found</div>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <Button
              type="primary"
              block
              // icon={genMode === 'fair' ? <SwapOutlined /> : <ThunderboltOutlined />}
              onClick={handleGenerate}
              disabled={genSelected.length < requiredPlayers}
              style={{
                height: 48,
                borderRadius: 10,
                background: genSelected.length < requiredPlayers
                  ? '#21262D'
                  : genMode === 'fair' ? '#4ADE80' : '#FF6B6B',
                border: 'none',
                color: genSelected.length < requiredPlayers ? '#484F58' : '#0D1117',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: 1,
                marginTop: 4,
              }}
            >
              {genMode === 'fair' ? 'GENERATE BALANCED MATCH' : 'GENERATE RANDOM MATCH'}
            </Button>
          </div>
        )}
      </div>

      <Modal 
        title="Manage Players" 
        open={isManageModalOpen} 
        footer={null} 
        onCancel={() => setIsManageModalOpen(false)} 
        className="dark-modal manage-players-modal" 
        width={450}
      >
        <div style={{ marginTop: '16px' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input autoFocus={false} placeholder="Add new player name..." value={newName} onChange={e => setNewName(e.target.value)} className="dark-input" onPressEnter={handleAddPlayer} />
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddPlayer} 
              loading={loading} 
              style={{ background: '#5C7CFA', boxShadow: 'none', border: 'none' }}>
                Add
            </Button>
          </Space.Compact>
        </div>
        <Divider style={{ borderColor: '#30363D', margin: '16px 0' }} />
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {players.map((p: any) => (
            <div key={p.id} className="manage-item">
              {editingId === p.id ? (
                <Input autoFocus={false} value={tempName} onChange={e => setTempName(e.target.value)} className="dark-input" size="small" style={{ marginLeft: 8 }} />
              ) : ( <span style={{ fontWeight: 500, color: 'white', marginLeft: '16px' }}>{p.name}</span> )}
              <Space size={0}>
                {editingId === p.id ? (
                  <><Button type="text" icon={<CheckOutlined style={{ color: '#4ADE80' }} />} onClick={() => handleUpdateName(p.id)} /><Button type="text" icon={<CloseOutlined style={{ color: '#FF6B6B' }} />} onClick={() => setEditingId(null)} /></>
                ) : (
                  <><Button type="text" icon={<EditOutlined style={{ color: '#8B949E' }} />} onClick={() => { setEditingId(p.id); setTempName(p.name); }} /><Popconfirm cancelButtonProps={{ style: { borderColor: 'white', color: 'white', background: 'black' } }} title="Delete Player?" description="This action is permanent." onConfirm={() => handleDeletePlayer(p.id)} okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }} placement="left"><Button type="text" icon={<DeleteOutlined style={{ color: '#FF6B6B' }} />} /></Popconfirm></>
                )}
              </Space>
            </div>
          ))}
        </div>
      </Modal>

      {/* --- GENERATE RESULT MODAL --- */}
      {genResult && (() => {
        const eloDiff = Math.abs(Math.round(avgElo(genResult.teamA) - avgElo(genResult.teamB)));
        return (
          <Modal
            title="Generated Match"
            open={isGenResultModalOpen}
            footer={null}
            onCancel={() => setIsGenResultModalOpen(false)}
            className="dark-modal"
            width={400}
          >
            <div style={{ paddingTop: 8 }}>
              {/* Team Blue */}
              <div className="gen-team-row" style={{ background: '#5C7CFA12', border: '1px solid #5C7CFA30', borderRadius: 10, padding: '12px 16px', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#5C7CFA', letterSpacing: 1, marginBottom: 6 }}>TEAM BLUE</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {genResult.teamA.map((p: any) => (
                      <span key={p.id} style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{p.name}</span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#5C7CFA' }}>{Math.round(avgElo(genResult.teamA))}</div>
                  <div style={{ fontSize: 10, color: '#484F58' }}>avg ELO</div>
                </div>
              </div>

              <div style={{ textAlign: 'center', color: '#484F58', fontSize: 11, fontWeight: 700, margin: '6px 0' }}>VS</div>

              {/* Team Gold */}
              <div className="gen-team-row" style={{ background: '#FFBE0B12', border: '1px solid #FFBE0B30', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#FFBE0B', letterSpacing: 1, marginBottom: 6 }}>TEAM GOLD</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {genResult.teamB.map((p: any) => (
                      <span key={p.id} style={{ fontSize: 13, fontWeight: 600, color: '#E6EDF3' }}>{p.name}</span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FFBE0B' }}>{Math.round(avgElo(genResult.teamB))}</div>
                  <div style={{ fontSize: 10, color: '#484F58' }}>avg ELO</div>
                </div>
              </div>

              {/* Fairness bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#8B949E' }}>ELO difference</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: eloDiff <= 30 ? '#4ADE80' : eloDiff <= 80 ? '#FFBE0B' : '#FF6B6B' }}>
                    {eloDiff} pts — {eloDiff <= 30 ? 'Very Fair' : eloDiff <= 80 ? 'Fair' : 'Uneven'}
                  </span>
                </div>
                <div className="fairness-bar-bg">
                  <div
                    className="fairness-bar-fill"
                    style={{
                      width: `${Math.max(4, 100 - Math.min(eloDiff / 2, 100))}%`,
                      background: eloDiff <= 30 ? '#4ADE80' : eloDiff <= 80 ? '#FFBE0B' : '#FF6B6B',
                    }}
                  />
                </div>
              </div>

              {/* Regenerate */}
              <button
                onClick={handleGenerate}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'transparent',
                  border: '1px solid #30363D',
                  borderRadius: 8,
                  color: '#8B949E',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Regenerate
              </button>
            </div>
          </Modal>
        );
      })()}

      {/* --- MATCH MODAL --- */}
      <Modal 
        title="Record Match" 
        open={isMatchModalOpen} 
        onOk={handleMatchSubmit} 
        confirmLoading={loading} 
        onCancel={() => {
          setIsMatchModalOpen(false);
          setTeamA([]); 
          setTeamB([]); 
          setScoreA(undefined); 
          setScoreB(undefined);
          setMatchType(2);
          setPlayerSearch('');
        }} 
        className="dark-modal" 
        width={400}
        okText="Record Match"
        okButtonProps={{ style: { background: '#5C7CFA' } }}
        cancelButtonProps={{ style: { background: '#0D1117', borderColor: 'white', color: 'white' } }}
      >
        <Radio.Group 
          value={matchType} 
          onChange={e => { setMatchType(e.target.value); setTeamA([]); setTeamB([]); }} 
          style={{ marginBottom: 15 }} 
          optionType="button"
          className="add-match-radio-group"
        >
            <Radio value={2}>Doubles</Radio>
            <Radio value={3}>Triples</Radio>
        </Radio.Group>

        <div className="team-selection-area" style={{ borderColor: '#5C7CFA30' }}>
            <div className="team-label" style={{ color: '#5C7CFA' }}>TEAM BLUE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {teamA.map(p => (
                    <Tag 
                      key={p.id} 
                      onClick={() => removeFromTeam(p.id, 'A')}
                      style={{ 
                          borderRadius: 6, 
                          fontWeight: 600,
                          background: "#5C7CFA",
                          color: "white"
                      }}>
                        {p.name}
                    </Tag>
                ))}
            </div>
            <Input autoFocus={false} type="number" placeholder="Blue Score" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value))} className="dark-input" />
        </div>

        <div className="team-selection-area" style={{ borderColor: '#FFBE0B30' }}>
            <div className="team-label" style={{ color: '#FFBE0B' }}>TEAM GOLD</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {teamB.map(p => (
                    <Tag 
                      key={p.id} 
                      onClick={() => removeFromTeam(p.id, 'B')}
                      style={{ 
                        borderRadius: 6, 
                        fontWeight: 600, 
                        color: 'white',
                        background: "#FFBE0B",
                      }}
                    >
                        {p.name}
                    </Tag>
                ))}
            </div>
            <Input autoFocus={false} type="number" placeholder="Gold Score" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value))} className="dark-input" />
        </div>

        <Divider style={{ borderColor: '#30363D', margin: '15px 0', color: 'white' }}>Pick Players</Divider>
        
        <Input 
          autoFocus={false} 
          prefix={<SearchOutlined />} 
          placeholder="Search players..." 
          value={playerSearch} 
          onChange={e => setPlayerSearch(e.target.value)} 
          className="dark-input" 
          style={{ marginBottom: 10 }} 
        />
        
        <div className="player-grid">
            {availablePlayers.length > 0 ? availablePlayers.map((p: any) => (
                <button 
                  key={p.id} 
                  onClick={() => {
                    togglePlayerSelection(p);
                    setPlayerSearch('');
                  }} 
                  className="btn" style={{ background: "#21262D", color: "white", fontSize: 11, padding: '8px 12px' }}
                >
                    {p.name}
                </button>
            )) : (
                <div style={{ color: '#484F58', fontSize: 12, textAlign: 'center', width: '100%', padding: '20px' }}>No more players available</div>
            )}
        </div>
      </Modal>
    </div>
  );
}
