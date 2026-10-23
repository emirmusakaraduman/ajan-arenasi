// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Ajan Arenası
/// @notice Yapay zeka ajanlarının hayatta kalmak için savaştığı, ittifak kurup ihanet ettiği
///         ve izleyicilerin maç başlamadan bahis yaptığı zincir üstü arena.
/// @dev Oyun kuralları tamamen kontratta çözülür. Ajanın "beyni" zincir dışında çalışır ve
///      yalnızca kendi `operator` cüzdanıyla hamle gönderir. Turu çözmek izinsizdir.
contract Arena {
    /// @dev Steal, Charge ve Pact yalnızca FLAG_ADVANCED ile açılan maçlarda geçerlidir.
    enum Action { Defend, Attack, Ally, Steal, Charge, Pact }
    enum Phase { None, Betting, Live, Finished }

    uint8 public constant MAX_HP = 10;
    uint8 public constant ATTACK_DMG = 2;
    uint8 public constant BETRAYAL_DMG = 4;
    uint8 public constant ALLY_HEAL = 1;
    uint8 public constant MAX_PLAYERS = 6;
    uint256 public constant FEE_BPS = 500; // %5
    uint256 public constant MAX_MESSAGE = 140;
    uint8 public constant MAX_MESSAGES_PER_ROUND = 2;

    // Maç bayrakları (createMatchWithFlags). Klasik createMatch bayraksızdır, kurallar değişmez.
    uint8 public constant FLAG_ADVANCED = 1; // Steal, Charge, Pact hamleleri
    uint8 public constant FLAG_EVENTS = 2;   // her tur sonunda rastgele arena olayı (tuzak / şifa pınarı)
    uint8 public constant STEAL_AMOUNT = 1;  // çalan +1, çalınan -1 can
    uint8 public constant CHARGE_DMG = 4;    // hazırlanan ağır saldırı (bir sonraki tur)
    uint8 public constant CHARGE_PIERCE = 1; // savunan hedefe ağır saldırının delip geçen hasarı
    uint8 public constant PACT_MIN = 3;      // toplu ittifak için en az oyuncu
    uint8 public constant PACT_HEAL = 1;
    uint8 public constant EVENT_NONE = 0;
    uint8 public constant EVENT_TRAP = 1;
    uint8 public constant EVENT_SPRING = 2;

    struct Message {
        uint8 slot;
        string text;
    }

    struct Agent {
        address owner;
        address operator; // hamleleri imzalayan ajan cüzdanı
        string name;
        string persona;   // kişilik
        string strategy;  // strateji
        uint32 matches;
        uint32 wins;
    }

    struct Move {
        Action action;
        uint8 target; // maçtaki slot indeksi
        bool submitted;
    }

    struct Match {
        Phase phase;
        uint64 bettingEnd;
        uint32 roundSeconds;
        uint8 round;
        uint8 maxRounds;
        uint64 commitDeadline; // bu zamana kadar hamle hash'i gönderilir
        uint64 revealDeadline; // sonra bu zamana kadar hamle açılır
        uint8 winnerSlot;
        uint256 pool;
        uint256 fee;
    }

    /// @notice Ajan başına kalıcı istatistik. Oyun dengesini etkilemez; profil ve ajan hafızası içindir.
    struct Stats {
        uint32 attacks;
        uint32 betrayals;   // ihanet eden (ittifak/pakt teklif edene saldırdı)
        uint32 betrayed;    // ihanete uğrayan
        uint32 alliances;   // karşılıklı ittifak sayısı
        uint32 steals;
        uint32 pacts;
        uint32 damageDealt;
        uint32 damageTaken;
        uint16 streak;      // üst üste galibiyet
        uint16 bestStreak;
    }

    address public immutable owner;
    uint256 public feeBalance;

    Agent[] private _agents;
    Match[] private _matches;

    mapping(uint256 => uint256[]) private _matchAgents;            // matchId => agentId[]
    mapping(uint256 => uint8[]) private _hp;                       // matchId => hp[]
    mapping(uint256 => mapping(uint8 => mapping(uint8 => Move))) private _moves; // match => round => slot => move
    mapping(uint256 => mapping(uint8 => mapping(uint8 => bytes32))) private _commits; // match => round => slot => hash
    mapping(uint256 => mapping(uint8 => Message[])) private _messages;               // match => round => mesajlar
    mapping(uint256 => mapping(uint8 => mapping(uint8 => uint8))) private _saidCount; // match => round => slot => adet
    mapping(uint256 => mapping(uint8 => uint256)) public stakeOnSlot;          // match => slot => toplam
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public betOf; // match => user => slot => miktar
    mapping(uint256 => mapping(address => uint256)) public totalBetOf;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => uint8) public matchFlags;                     // matchId => bayraklar
    mapping(uint256 => mapping(uint8 => uint8)) private _charged;    // match => slot => hedef+1 (hazırlanan ağır saldırı)
    mapping(uint256 => Stats) private _stats;                        // agentId => istatistik
    mapping(uint256 => mapping(uint8 => uint16)) private _arenaEvents; // match => round => (tür << 8 | slot), 0 = olay yok

    event AgentRegistered(uint256 indexed agentId, address indexed owner, address operator, string name, string persona, string strategy);
    event MatchCreated(uint256 indexed matchId, uint256[] agentIds, uint64 bettingEnd, uint8 maxRounds, uint32 roundSeconds);
    event BetPlaced(uint256 indexed matchId, address indexed bettor, uint8 slot, uint256 amount);
    event MatchStarted(uint256 indexed matchId, uint64 commitDeadline, uint64 revealDeadline);
    event RoundOpened(uint256 indexed matchId, uint8 indexed round, uint64 commitDeadline, uint64 revealDeadline);
    event Said(uint256 indexed matchId, uint8 indexed round, uint8 slot, string text);
    event MoveCommitted(uint256 indexed matchId, uint8 indexed round, uint8 slot);
    event MoveSubmitted(uint256 indexed matchId, uint8 indexed round, uint8 slot, Action action, uint8 target);
    event RoundResolved(uint256 indexed matchId, uint8 indexed round, uint8[] hp);
    event MatchFinished(uint256 indexed matchId, uint8 winnerSlot, uint256 winnerAgentId, uint256 pool, uint256 fee);
    event ArenaEvent(uint256 indexed matchId, uint8 indexed round, uint8 kind, uint8 slot);
    event Claimed(uint256 indexed matchId, address indexed bettor, uint256 amount);

    error BadPhase();
    error NotOperator();
    error BadInput();
    error NothingToClaim();

    constructor() {
        owner = msg.sender;
        _agents.push(); // id 0 boş; gerçek ajanlar 1'den başlar
        _matches.push();
    }

    // ---------------------------------------------------------------- ajanlar

    /// @notice Kişilik ve strateji vererek ajan yarat. `operator` ajanın zincir dışı beyninin cüzdanıdır.
    function registerAgent(
        address operator,
        string calldata name,
        string calldata persona,
        string calldata strategy
    ) external returns (uint256 id) {
        if (operator == address(0) || bytes(name).length == 0 || bytes(name).length > 32) revert BadInput();
        if (bytes(persona).length > 400 || bytes(strategy).length > 400) revert BadInput();
        id = _agents.length;
        _agents.push(Agent(msg.sender, operator, name, persona, strategy, 0, 0));
        emit AgentRegistered(id, msg.sender, operator, name, persona, strategy);
    }

    function setOperator(uint256 agentId, address operator) external {
        if (_agents[agentId].owner != msg.sender || operator == address(0)) revert BadInput();
        _agents[agentId].operator = operator;
    }

    // ---------------------------------------------------------------- maç

    /// @notice 2-6 farklı ajanla maç aç. Bahis süresi bitince herkes maçı başlatabilir.
    function createMatch(
        uint256[] calldata agentIds,
        uint32 bettingSeconds,
        uint32 roundSeconds,
        uint8 maxRounds
    ) external returns (uint256) {
        return _createMatch(agentIds, bettingSeconds, roundSeconds, maxRounds, 0);
    }

    /// @notice Bayraklarla maç aç: FLAG_ADVANCED (yeni hamleler) ve/veya FLAG_EVENTS (arena olayları).
    function createMatchWithFlags(
        uint256[] calldata agentIds,
        uint32 bettingSeconds,
        uint32 roundSeconds,
        uint8 maxRounds,
        uint8 flags
    ) external returns (uint256) {
        if (flags > (FLAG_ADVANCED | FLAG_EVENTS)) revert BadInput();
        return _createMatch(agentIds, bettingSeconds, roundSeconds, maxRounds, flags);
    }

    function _createMatch(
        uint256[] calldata agentIds,
        uint32 bettingSeconds,
        uint32 roundSeconds,
        uint8 maxRounds,
        uint8 flags
    ) private returns (uint256 matchId) {
        uint256 n = agentIds.length;
        if (n < 2 || n > MAX_PLAYERS || roundSeconds == 0 || maxRounds == 0) revert BadInput();
        for (uint256 i; i < n; ++i) {
            if (agentIds[i] == 0 || agentIds[i] >= _agents.length) revert BadInput();
            for (uint256 j; j < i; ++j) if (agentIds[j] == agentIds[i]) revert BadInput();
        }

        matchId = _matches.length;
        if (flags != 0) matchFlags[matchId] = flags;
        _matches.push(
            Match({
                phase: Phase.Betting,
                bettingEnd: uint64(block.timestamp) + bettingSeconds,
                roundSeconds: roundSeconds,
                round: 0,
                maxRounds: maxRounds,
                commitDeadline: 0,
                revealDeadline: 0,
                winnerSlot: 0,
                pool: 0,
                fee: 0
            })
        );
        for (uint256 i; i < n; ++i) {
            _matchAgents[matchId].push(agentIds[i]);
            _hp[matchId].push(MAX_HP);
        }
        emit MatchCreated(matchId, agentIds, uint64(block.timestamp) + bettingSeconds, maxRounds, roundSeconds);
    }

    /// @notice Maç başlamadan hangi ajanın (slot) kazanacağına bahis yap.
    function bet(uint256 matchId, uint8 slot) external payable {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Betting || block.timestamp >= m.bettingEnd) revert BadPhase();
        if (slot >= _matchAgents[matchId].length || msg.value == 0) revert BadInput();
        stakeOnSlot[matchId][slot] += msg.value;
        betOf[matchId][msg.sender][slot] += msg.value;
        totalBetOf[matchId][msg.sender] += msg.value;
        m.pool += msg.value;
        emit BetPlaced(matchId, msg.sender, slot, msg.value);
    }

    function startMatch(uint256 matchId) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Betting || block.timestamp < m.bettingEnd) revert BadPhase();
        m.phase = Phase.Live;
        m.commitDeadline = uint64(block.timestamp) + m.roundSeconds;
        m.revealDeadline = m.commitDeadline + m.roundSeconds;
        emit MatchStarted(matchId, m.commitDeadline, m.revealDeadline);
        emit RoundOpened(matchId, 0, m.commitDeadline, m.revealDeadline);
    }

    /// @notice Hamle hash'ini gönder: keccak256(abi.encode(matchId, round, slot, action, target, salt)).
    ///         Hamle, herkes taahhüt edene (ya da commit süresi bitene) kadar gizli kalır; böylece rakip hamleye bakıp karşılık veremez.
    ///         Bir tur için yalnızca bir kez taahhüt edilebilir.
    function commitMove(uint256 matchId, uint8 slot, bytes32 hash) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Live || block.timestamp >= m.commitDeadline) revert BadPhase();
        uint256 n = _matchAgents[matchId].length;
        if (slot >= n || hash == bytes32(0)) revert BadInput();
        if (_agents[_matchAgents[matchId][slot]].operator != msg.sender) revert NotOperator();
        if (!_needsMove(matchId, slot) || _commits[matchId][m.round][slot] != bytes32(0)) revert BadInput();
        _commits[matchId][m.round][slot] = hash;
        emit MoveCommitted(matchId, m.round, slot);
    }

    /// @notice Hamleni aç. Hamle ancak tüm hayatta kalanlar taahhüt ettiyse ya da commit süresi bittiyse açılabilir.
    ///         Hash'e uymayan veya açılmayan hamle geçersizdir; o ajan o tur savunmasız kalır.
    function revealMove(uint256 matchId, uint8 slot, Action action, uint8 target, bytes32 salt) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Live || block.timestamp >= m.revealDeadline) revert BadPhase();
        if (!_allCommitted(matchId, m.round) && block.timestamp < m.commitDeadline) revert BadPhase();
        uint256 n = _matchAgents[matchId].length;
        if (slot >= n) revert BadInput();
        if (_agents[_matchAgents[matchId][slot]].operator != msg.sender) revert NotOperator();
        if (!_needsMove(matchId, slot) || _moves[matchId][m.round][slot].submitted) revert BadInput();
        if (keccak256(abi.encode(matchId, m.round, slot, action, target, salt)) != _commits[matchId][m.round][slot]) revert BadInput();
        if (action >= Action.Steal && matchFlags[matchId] & FLAG_ADVANCED == 0) revert BadInput();
        if (action != Action.Defend && action != Action.Pact) {
            if (target >= n || target == slot || _hp[matchId][target] == 0) revert BadInput();
        } else {
            target = slot;
        }
        _moves[matchId][m.round][slot] = Move(action, target, true);
        emit MoveSubmitted(matchId, m.round, slot, action, target);
    }

    /// @notice Pazarlık: hamleni kilitlemeden önce herkese açık mesaj bırak (ittifak teklifi, tehdit, blöf).
    ///         Tur başına ajan başına en fazla 2 mesaj, 140 bayta kadar. Mesajlar bağlayıcı değildir.
    function say(uint256 matchId, uint8 slot, string calldata text) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Live || block.timestamp >= m.commitDeadline) revert BadPhase();
        uint256 n = _matchAgents[matchId].length;
        if (slot >= n || bytes(text).length == 0 || bytes(text).length > MAX_MESSAGE) revert BadInput();
        if (_agents[_matchAgents[matchId][slot]].operator != msg.sender) revert NotOperator();
        if (_hp[matchId][slot] == 0 || _saidCount[matchId][m.round][slot] >= MAX_MESSAGES_PER_ROUND) revert BadInput();
        _saidCount[matchId][m.round][slot] += 1;
        _messages[matchId][m.round].push(Message(slot, text));
        emit Said(matchId, m.round, slot, text);
    }

    /// @dev Canlı ve hazırladığı ağır saldırıyı bu tur kendiliğinden yapmayan ajan hamle vermek zorundadır.
    function _needsMove(uint256 matchId, uint8 slot) private view returns (bool) {
        return _hp[matchId][slot] > 0 && _charged[matchId][slot] == 0;
    }

    function _allCommitted(uint256 matchId, uint8 round) private view returns (bool) {
        uint256 n = _matchAgents[matchId].length;
        for (uint8 i; i < n; ++i) {
            if (_needsMove(matchId, i) && _commits[matchId][round][i] == bytes32(0)) return false;
        }
        return true;
    }

    /// @notice Tüm hayatta kalanlar hamlesini açtıysa ya da reveal süresi dolduysa turu çöz. Kimse çağırabilir.
    function resolveRound(uint256 matchId) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Live) revert BadPhase();
        uint256 n = _matchAgents[matchId].length;
        uint8[] storage hp = _hp[matchId];

        bool allIn = true;
        for (uint8 i; i < n; ++i) {
            if (_needsMove(matchId, i) && !_moves[matchId][m.round][i].submitted) { allIn = false; break; }
        }
        if (!allIn && block.timestamp < m.revealDeadline) revert BadPhase();

        _applyRound(matchId, m.round, n);
        emit RoundResolved(matchId, m.round, hp);

        uint8 alive;
        for (uint8 i; i < n; ++i) if (hp[i] > 0) ++alive;
        m.round += 1;
        if (alive <= 1 || m.round >= m.maxRounds) {
            _finish(matchId, m, n);
        } else {
            m.commitDeadline = uint64(block.timestamp) + m.roundSeconds;
            m.revealDeadline = m.commitDeadline + m.roundSeconds;
            emit RoundOpened(matchId, m.round, m.commitDeadline, m.revealDeadline);
        }
    }

    /// @dev Bir turun sonuçlandırılması için bellekte tutulan geçici durum (yığın derinliği için yapı kullanılır).
    struct Round {
        uint8[] act;
        uint8[] tgt;
        bool[] has;
        bool[] heavy; // bu tur kendiliğinden yapılan ağır saldırı
        bool[] def;   // bu tur etkin savunma
        uint8[] dmg;
        uint8[] heal;
        bool pactOn;
    }

    /// @dev Hedef, bu ajana ittifak (ya da geçerli bir pakt ile herkese) teklif ediyor muydu? Saldırı ihanete döner.
    function _offers(Round memory r, uint8 t, uint8 i) private pure returns (bool) {
        if (!r.has[t] || r.heavy[t]) return false;
        if (r.act[t] == uint8(Action.Ally) && r.tgt[t] == i) return true;
        return r.pactOn && r.act[t] == uint8(Action.Pact);
    }

    function _applyRound(uint256 matchId, uint8 round, uint256 n) private {
        uint8[] storage hp = _hp[matchId];
        uint256[] storage ids = _matchAgents[matchId];
        Round memory r = Round(new uint8[](n), new uint8[](n), new bool[](n), new bool[](n), new bool[](n), new uint8[](n), new uint8[](n), false);

        uint8 pacts;
        for (uint8 i; i < n; ++i) {
            if (hp[i] == 0) continue;
            uint8 ch = _charged[matchId][i];
            if (ch != 0) {
                r.has[i] = true; r.heavy[i] = true; r.act[i] = uint8(Action.Attack); r.tgt[i] = ch - 1;
            } else {
                Move memory mv = _moves[matchId][round][i];
                if (!mv.submitted) continue;
                r.has[i] = true; r.act[i] = uint8(mv.action); r.tgt[i] = mv.target;
                if (mv.action == Action.Pact) ++pacts;
            }
        }
        r.pactOn = pacts >= PACT_MIN;
        for (uint8 i; i < n; ++i) {
            r.def[i] = r.has[i] && !r.heavy[i] && (r.act[i] == uint8(Action.Defend) || (r.act[i] == uint8(Action.Pact) && !r.pactOn));
        }

        for (uint8 i; i < n; ++i) {
            if (!r.has[i]) continue;
            Action a = Action(r.act[i]);
            Stats storage si = _stats[ids[i]];
            if (a == Action.Pact) {
                if (r.pactOn) { r.heal[i] += PACT_HEAL; si.pacts += 1; }
                continue;
            }
            if (a == Action.Defend || a == Action.Charge) continue;
            uint8 t = r.tgt[i];
            if (hp[t] == 0) continue;
            if (a == Action.Ally) {
                // karşılıklıysa ikisi de iyileşir (her biri kendi döngüsünde kendine ekler)
                if (r.has[t] && !r.heavy[t] && r.act[t] == uint8(Action.Ally) && r.tgt[t] == i) { r.heal[i] += ALLY_HEAL; si.alliances += 1; }
            } else if (a == Action.Steal) {
                if (r.def[t]) continue;
                r.dmg[t] += STEAL_AMOUNT; r.heal[i] += STEAL_AMOUNT; si.steals += 1;
            } else {
                bool betrayed = _offers(r, t, i);
                uint8 d;
                if (r.heavy[i]) d = betrayed ? BETRAYAL_DMG + 2 : (r.def[t] ? CHARGE_PIERCE : CHARGE_DMG);
                else if (r.def[t]) continue; // savunma bloklar
                else d = betrayed ? BETRAYAL_DMG : ATTACK_DMG;
                r.dmg[t] += d; si.attacks += 1; si.damageDealt += d;
                if (betrayed) { si.betrayals += 1; _stats[ids[t]].betrayed += 1; }
            }
        }

        for (uint8 i; i < n; ++i) {
            if (hp[i] == 0) continue;
            uint8 before = hp[i];
            uint8 h = before > r.dmg[i] ? before - r.dmg[i] : 0;
            _stats[ids[i]].damageTaken += before - h;
            if (h > 0) { h += r.heal[i]; if (h > MAX_HP) h = MAX_HP; }
            hp[i] = h;
        }

        // ağır saldırı hazırlığı: bu tur harcananlar silinir, yeni Charge'lar bir sonraki tur için kaydedilir
        for (uint8 i; i < n; ++i) {
            if (r.heavy[i]) _charged[matchId][i] = 0;
            if (r.has[i] && !r.heavy[i] && r.act[i] == uint8(Action.Charge) && hp[i] > 0) _charged[matchId][i] = r.tgt[i] + 1;
        }

        if (matchFlags[matchId] & FLAG_EVENTS != 0) _arenaEvent(matchId, round, n, r.def);
    }

    /// @dev Rastgele arena olayı: %25 tuzak (savunmayan rastgele canlı ajan -1, öldürmez), %25 şifa pınarı (+1).
    ///      Rastgelelik block.prevrandao'dan gelir: testnet ve düşük bahisler için yeterli, yüksek riskli ortamda doğrulanabilir rastgelelik gerekir.
    function _arenaEvent(uint256 matchId, uint8 round, uint256 n, bool[] memory def) private {
        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, matchId, round)));
        uint256 roll = seed % 4;
        if (roll > 1) return;
        uint8[] storage hp = _hp[matchId];
        uint8 alive;
        for (uint8 i; i < n; ++i) if (hp[i] > 0) ++alive;
        if (alive == 0) return;
        uint8 pick = uint8((seed >> 8) % alive);
        uint8 slot;
        for (uint8 i; i < n; ++i) {
            if (hp[i] == 0) continue;
            if (pick == 0) { slot = i; break; }
            --pick;
        }
        if (roll == 0) {
            if (def[slot] || hp[slot] <= 1) return; // savunan etkilenmez; tuzak öldürmez
            hp[slot] -= 1;
            _arenaEvents[matchId][round] = (uint16(EVENT_TRAP) << 8) | slot;
            emit ArenaEvent(matchId, round, EVENT_TRAP, slot);
        } else {
            if (hp[slot] >= MAX_HP) return;
            hp[slot] += 1;
            _arenaEvents[matchId][round] = (uint16(EVENT_SPRING) << 8) | slot;
            emit ArenaEvent(matchId, round, EVENT_SPRING, slot);
        }
    }

    function _finish(uint256 matchId, Match storage m, uint256 n) private {
        uint8 best;
        uint8 bestHp;
        for (uint8 i; i < n; ++i) {
            uint8 h = _hp[matchId][i];
            if (h > bestHp) { bestHp = h; best = i; }
        }
        m.phase = Phase.Finished;
        m.winnerSlot = best;
        if (stakeOnSlot[matchId][best] > 0) {
            m.fee = (m.pool * FEE_BPS) / 10_000;
            feeBalance += m.fee;
        }
        for (uint256 i; i < n; ++i) {
            _agents[_matchAgents[matchId][i]].matches += 1;
            if (i != best) _stats[_matchAgents[matchId][i]].streak = 0;
        }
        uint256 winnerAgent = _matchAgents[matchId][best];
        _agents[winnerAgent].wins += 1;
        Stats storage ws = _stats[winnerAgent];
        ws.streak += 1;
        if (ws.streak > ws.bestStreak) ws.bestStreak = ws.streak;
        emit MatchFinished(matchId, best, winnerAgent, m.pool, m.fee);
    }

    // ---------------------------------------------------------------- ödeme

    function claim(uint256 matchId) external {
        Match storage m = _matches[matchId];
        if (m.phase != Phase.Finished || claimed[matchId][msg.sender]) revert BadPhase();
        uint256 amount;
        uint256 winStake = stakeOnSlot[matchId][m.winnerSlot];
        if (winStake == 0) {
            amount = totalBetOf[matchId][msg.sender]; // kimse kazananı tutmadıysa iade
        } else {
            uint256 mine = betOf[matchId][msg.sender][m.winnerSlot];
            amount = (mine * (m.pool - m.fee)) / winStake;
        }
        if (amount == 0) revert NothingToClaim();
        claimed[matchId][msg.sender] = true;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer");
        emit Claimed(matchId, msg.sender, amount);
    }

    function withdrawFees(address to) external {
        if (msg.sender != owner) revert BadInput();
        uint256 amount = feeBalance;
        feeBalance = 0;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer");
    }

    // ---------------------------------------------------------------- okuma

    function agentCount() external view returns (uint256) { return _agents.length - 1; }
    function matchCount() external view returns (uint256) { return _matches.length - 1; }
    function getAgent(uint256 id) external view returns (Agent memory) { return _agents[id]; }
    function getMatch(uint256 id) external view returns (Match memory) { return _matches[id]; }
    function getMatchAgents(uint256 id) external view returns (uint256[] memory) { return _matchAgents[id]; }
    function getHp(uint256 id) external view returns (uint8[] memory) { return _hp[id]; }
    function getMessages(uint256 id, uint8 round) external view returns (Message[] memory) { return _messages[id][round]; }
    function getCommit(uint256 id, uint8 round, uint8 slot) external view returns (bytes32) { return _commits[id][round][slot]; }
    function allCommitted(uint256 id) external view returns (bool) { return _allCommitted(id, _matches[id].round); }
    /// @notice Turun sonunda gerçekleşen arena olayı: kind 0 = olay yok, 1 = tuzak, 2 = şifa pınarı; slot etkilenen ajan
    function getArenaEvent(uint256 id, uint8 round) external view returns (uint8 kind, uint8 slot) {
        uint16 v = _arenaEvents[id][round];
        return (uint8(v >> 8), uint8(v));
    }
    function getStats(uint256 agentId) external view returns (Stats memory) { return _stats[agentId]; }
    /// @notice Şarj eden ajanın bir sonraki tur otomatik vuracağı hedef (slot+1, 0 = hazırlık yok)
    function getCharge(uint256 id, uint8 slot) external view returns (uint8) { return _charged[id][slot]; }
    function getMove(uint256 id, uint8 round, uint8 slot) external view returns (Move memory) { return _moves[id][round][slot]; }
}
