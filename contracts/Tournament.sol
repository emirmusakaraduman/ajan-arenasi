// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Arena.getMatch'in döndürdüğü yapının ABI uyumlu kopyası
struct ArenaMatch {
    uint8 phase; // 3 = bitti
    uint64 bettingEnd;
    uint32 roundSeconds;
    uint8 round;
    uint8 maxRounds;
    uint64 commitDeadline;
    uint64 revealDeadline;
    uint8 winnerSlot;
    uint256 pool;
    uint256 fee;
}

interface IArena {
    function createMatchWithFlags(uint256[] calldata agentIds, uint32 bettingSeconds, uint32 roundSeconds, uint8 maxRounds, uint8 flags)
        external
        returns (uint256);
    function getMatch(uint256 id) external view returns (ArenaMatch memory);
    function getMatchAgents(uint256 id) external view returns (uint256[] memory);
}

/// @title Ajan Arenası turnuvası
/// @notice Eleme usulü, birebir maçlardan oluşan turnuva. Para tutmaz: her maç Arena'da normal bir maç olarak açılır
///         (izleyiciler o maçlara bahis yapar), kazananlar Arena'dan okunur. Turu ilerletmek izinsizdir.
/// @dev Katılımcı sayısı 2, 4, 8 ya da 16 olmalıdır. Eşit canla biten maçta Arena kuralı gereği ilk slot kazanır.
contract Tournament {
    IArena public immutable arena;

    struct Info {
        address creator;
        uint8 size;       // katılımcı sayısı
        uint8 round;      // şu an oynanan tur (0'dan)
        uint8 rounds;     // toplam tur sayısı (log2(size))
        uint32 bettingSeconds;
        uint32 roundSeconds;
        uint8 maxRounds;
        uint8 flags;
        uint256 champion; // şampiyon ajan id'si, 0 = turnuva sürüyor
    }

    Info[] private _tournaments;
    mapping(uint256 => uint256[]) private _entrants;                        // tid => ajan id'leri (kura sırası)
    mapping(uint256 => mapping(uint8 => uint256[])) private _players;       // tid => tur => o turdaki ajanlar
    mapping(uint256 => mapping(uint8 => uint256[])) private _matches;       // tid => tur => Arena maç id'leri

    event TournamentCreated(uint256 indexed tid, address indexed creator, uint256[] agentIds);
    event RoundOpened(uint256 indexed tid, uint8 indexed round, uint256[] matchIds);
    event TournamentFinished(uint256 indexed tid, uint256 championAgentId);

    error BadInput();
    error NotReady();
    error AlreadyFinished();

    constructor(IArena arena_) {
        arena = arena_;
        _tournaments.push(); // id 0 boş
    }

    /// @notice Turnuva kur ve ilk turun maçlarını hemen aç. `agentIds` sırası kurayı belirler: (0,1), (2,3), ...
    function createTournament(
        uint256[] calldata agentIds,
        uint32 bettingSeconds,
        uint32 roundSeconds,
        uint8 maxRounds,
        uint8 flags
    ) external returns (uint256 tid) {
        uint256 n = agentIds.length;
        if (n != 2 && n != 4 && n != 8 && n != 16) revert BadInput();
        for (uint256 i; i < n; ++i) {
            for (uint256 j; j < i; ++j) if (agentIds[j] == agentIds[i]) revert BadInput();
        }
        uint8 rounds;
        for (uint256 s = n; s > 1; s >>= 1) ++rounds;

        tid = _tournaments.length;
        _tournaments.push(Info(msg.sender, uint8(n), 0, rounds, bettingSeconds, roundSeconds, maxRounds, flags, 0));
        for (uint256 i; i < n; ++i) _entrants[tid].push(agentIds[i]);
        emit TournamentCreated(tid, msg.sender, agentIds);
        _openRound(tid, agentIds);
    }

    /// @notice Mevcut turun tüm maçları bittiyse bir sonraki turu açar; tek kişi kaldıysa şampiyonu belirler. Kimse çağırabilir.
    function advance(uint256 tid) external {
        Info storage t = _tournaments[tid];
        if (t.creator == address(0)) revert BadInput();
        if (t.champion != 0) revert AlreadyFinished();

        uint256[] storage ms = _matches[tid][t.round];
        uint256[] memory winners = new uint256[](ms.length);
        for (uint256 i; i < ms.length; ++i) {
            ArenaMatch memory m = arena.getMatch(ms[i]);
            if (m.phase != 3) revert NotReady();
            winners[i] = arena.getMatchAgents(ms[i])[m.winnerSlot];
        }
        if (winners.length == 1) {
            t.champion = winners[0];
            emit TournamentFinished(tid, winners[0]);
            return;
        }
        t.round += 1;
        _openRound(tid, winners);
    }

    function _openRound(uint256 tid, uint256[] memory players) private {
        Info storage t = _tournaments[tid];
        uint8 r = t.round;
        uint256 pairs = players.length / 2;
        uint256[] memory ids = new uint256[](pairs);
        for (uint256 i; i < pairs; ++i) {
            uint256[] memory duel = new uint256[](2);
            duel[0] = players[2 * i];
            duel[1] = players[2 * i + 1];
            ids[i] = arena.createMatchWithFlags(duel, t.bettingSeconds, t.roundSeconds, t.maxRounds, t.flags);
            _matches[tid][r].push(ids[i]);
        }
        for (uint256 i; i < players.length; ++i) _players[tid][r].push(players[i]);
        emit RoundOpened(tid, r, ids);
    }

    // ---------------------------------------------------------------- okuma

    function tournamentCount() external view returns (uint256) { return _tournaments.length - 1; }
    function getTournament(uint256 tid) external view returns (Info memory) { return _tournaments[tid]; }
    function getEntrants(uint256 tid) external view returns (uint256[] memory) { return _entrants[tid]; }
    function getRoundPlayers(uint256 tid, uint8 round) external view returns (uint256[] memory) { return _players[tid][round]; }
    function getRoundMatches(uint256 tid, uint8 round) external view returns (uint256[] memory) { return _matches[tid][round]; }
}
