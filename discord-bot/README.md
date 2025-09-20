# Discord Leveling Bot

A Discord bot with a user leveling system built with Node.js, Discord.js, and SQLite. Features XP tracking, level progression, and customizable rewards.

## Features

- 📈 **Advanced XP System**: Users gain XP by sending messages with exponential level progression
- 🏆 **Dynamic Leveling**: Exponentially increasing XP requirements for higher levels
- 📊 **Enhanced Commands**: Detailed level information with progress bars and XP breakdowns
- 🎉 **Level Up Notifications**: Beautiful embeds celebrating user progress
- 🏅 **Configurable Role Rewards**: JSON-based role assignment system for levels 10, 20, 30, 40, 50
- � **Booster Role Support**: 2x XP multiplier for users with special booster roles
- �💾 **SQLite Database**: Persistent data storage with optimized queries
- 🐳 **Docker Support**: Production-ready containerization
- ⚙️ **JSON Configuration**: Easy customization via config.json file
- 📱 **Rich Embeds**: Detailed progress tracking and beautiful user interfaces
- 👋 **Smart Ping Response**: Helpful tips and info when the bot is mentioned

## Commands

### Leveling Commands
- `/level [user]` - Check your level or another user's level
- `/leaderboard [limit]` - Show the server's XP leaderboard

### Economy & Gambling Commands
- `/gambling [game] [bet]` - Play gambling games (coin flip, blackjack, poker)
- `/balance [subcommand]` - Check coin balance, statistics, or view leaderboard
  - `/balance me` - Check your own balance and stats
  - `/balance user [target]` - Check another user's balance
  - `/balance leaderboard [limit]` - Show richest users in server
- `/daily` - Claim your daily coin reward and maintain your streak
- `/bank [subcommand]` - Manage your secure bank account
  - `/bank info` - View your bank account information
  - `/bank deposit [amount]` - Deposit money into your bank
  - `/bank withdraw [amount]` - Withdraw money from your bank
  - `/bank upgrade` - Upgrade your bank to increase storage limit
- `/steal [target]` - Attempt to steal coins from a user (24h cooldown, 45% success rate)

### Interactive Features
- **@mention the bot** - Get helpful tips and bot information
- **Game Selection Menu** - Choose games through interactive dropdown menus

## Setup

### Prerequisites

- Node.js 18.0.0 or higher
- A Discord bot application ([Create one here](https://discord.com/developers/applications))
- pnpm package manager

### Installation

1. **Clone or download this project**
   ```bash
   git clone <your-repo-url>
   cd discord-leveling-bot
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure your bot**
   - Copy `.env.example` to `.env` and fill in your Discord bot configuration
   - Copy `config.example.json` to `config.json` and customize role rewards
   - Get your bot token from [Discord Developer Portal](https://discord.com/developers/applications)

   **Environment Variables (.env):**
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_id_here
   GUILD_ID=your_guild_id_here
   DATABASE_PATH=./data/leveling.db
   ```

   **Bot Configuration (config.json):**
   ```json
   {
     "leveling": {
       "xpPerMessage": 15,
       "xpCooldown": 60000,
       "baseXpRequired": 100,
       "xpMultiplier": 1.5
     },
     "roleRewards": {
       "10": {
         "roleId": "YOUR_LEVEL_10_ROLE_ID",
         "name": "Level 10 Adventurer",
         "description": "Reached level 10!"
       },
       "20": {
         "roleId": "YOUR_LEVEL_20_ROLE_ID", 
         "name": "Level 20 Explorer",
         "description": "Reached level 20!"
       }
     }
   }
   ```

4. **Deploy slash commands**
   ```bash
   pnpm run deploy-commands
   ```

5. **Start the bot**
   ```bash
   pnpm start
   ```

   For development with auto-restart:
   ```bash
   pnpm run dev
   ```

## Configuration

### Configuration Files

The bot uses two main configuration files:

1. **`.env`** - Environment variables for sensitive data
2. **`config.json`** - Bot behavior and role reward configuration

### Environment Variables (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | ✅ |
| `CLIENT_ID` | Your Discord application ID | ✅ |
| `GUILD_ID` | Your Discord server ID | ✅ |
| `DATABASE_PATH` | Path to SQLite database file | Optional |

### Bot Configuration (config.json)

#### Leveling System
```json
{
  "leveling": {
    "xpPerMessage": 15,        // XP awarded per message
    "xpCooldown": 60000,       // Cooldown between XP gains (ms)
    "baseXpRequired": 100,     // Base XP required for level 2
    "xpMultiplier": 1.5,       // Exponential multiplier for level progression
    "boosterRoleId": "123...", // Role ID for XP boosters
    "boosterXpMultiplier": 2.0 // XP multiplier for booster role (2x = double XP)
  }
}
```

#### Role Rewards
Configure automatic role rewards for specific levels:
```json
{
  "roleRewards": {
    "10": {
      "roleId": "123456789012345678",
      "name": "Level 10 Adventurer",
      "description": "Reached level 10! You're getting started!"
    },
    "20": {
      "roleId": "234567890123456789",
      "name": "Level 20 Explorer", 
      "description": "Reached level 20! You're exploring well!"
    },
    "30": {
      "roleId": "345678901234567890",
      "name": "Level 30 Veteran",
      "description": "Reached level 30! You're a veteran member!"
    },
    "40": {
      "roleId": "456789012345678901",
      "name": "Level 40 Champion",
      "description": "Reached level 40! You're a true champion!"
    },
    "50": {
      "roleId": "567890123456789012",
      "name": "Level 50 Legend",
      "description": "Reached level 50! You're a legend!"
    }
  }
}
```

#### Gambling & Economy System
Configure the gambling games and economy settings:
```json
{
  "gambling": {
    "enabled": true,           // Enable/disable gambling system
    "startingMoney": 1000,     // Starting coins for new users
    "maxBet": 5000,           // Maximum bet amount
    "minBet": 10,             // Minimum bet amount
    "dailyReward": {
      "baseAmount": 100,       // Base daily reward amount
      "streakBonus": 50,       // Bonus per streak day
      "maxStreak": 30          // Maximum streak days
    },
    "games": {
      "coinFlip": {
        "enabled": true,
        "payout": 2.0,          // 2x payout for wins
        "name": "🪙 Coin Flip"
      },
      "blackjack": {
        "enabled": true,
        "payout": 2.0,          // 2x payout for wins
        "name": "🃏 Blackjack"
      },
      "poker": {
        "enabled": true,
        "name": "🎰 Poker",
        "payouts": {            // Payout multipliers for poker hands
          "royalFlush": 100,
          "straightFlush": 50,
          "fourOfAKind": 25,
          "fullHouse": 9,
          "flush": 6,
          "straight": 4,
          "threeOfAKind": 3,
          "twoPair": 2,
          "pair": 1
        }
      }
    },
    "steal": {
      "enabled": true,          // Enable/disable stealing system
      "cooldown": 86400000,     // Steal cooldown in milliseconds (24 hours)
      "successChance": 0.45,    // 45% chance of successful steal
      "minStealAmount": 50,     // Minimum amount that can be stolen
      "maxStealPercentage": 0.25 // Maximum 25% of target's wallet can be stolen
    },
    "bank": {
      "enabled": true,          // Enable/disable banking system
      "baseBankLimit": 5000,    // Starting bank storage limit
      "upgradeCosts": [1000, 2500, 5000, 10000, 25000, 50000, 100000], // Cost for each bank level upgrade
      "upgradeLimits": [10000, 25000, 50000, 100000, 250000, 500000, 1000000], // Storage limit for each bank level
      "maxBankLevel": 7         // Maximum bank level
    }
  }
}
```

#### Bot Mention Settings
Configure the bot's response when mentioned:
```json
{
  "messages": {
    "botMention": {
      "color": 65416,
      "title": "👋 Hey there!",
      "cooldown": 10000,        // 10 second cooldown between mentions
      "tips": [
        "💡 Use `/level` to check your current level and XP progress!",
        // ... more tips
      ]
    }
  }
}

#### Message Customization
```json
{
  "messages": {
    "levelUp": {
      "title": "🎉 Level Up!",
      "color": 65280,
      "footer": "Keep chatting to earn more XP!"
    },
    "level": {
      "color": 255
    },
    "leaderboard": {
      "color": 255,
      "medals": ["🥇", "🥈", "🥉"]
    }
  }
}
```

### Getting Discord IDs

1. **Bot Token & Application ID**: 
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your application → Bot → Copy token
   - Go to General Information → Copy Application ID

2. **Guild ID**: 
   - Enable Developer Mode in Discord
   - Right-click your server → Copy Server ID

3. **Role IDs**: 
   - Enable Developer Mode in Discord
   - Go to Server Settings → Roles → Right-click role → Copy Role ID

## Docker Deployment

### Using Docker Compose (Recommended)

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Build and start**
   ```bash
   docker-compose up -d
   ```

3. **Deploy commands** (first time only)
   ```bash
   docker-compose exec discord-bot pnpm run deploy-commands
   ```

4. **View logs**
   ```bash
   docker-compose logs -f discord-bot
   ```

### Using Docker directly

```bash
# Build the image
docker build -t discord-leveling-bot .

# Run the container
docker run -d \\
  --name discord-bot \\
  --env-file .env \\
  -v $(pwd)/data:/app/data \\
  discord-leveling-bot
```

## Leveling System

### XP Progression
- Users gain XP by sending messages (configurable amount)
- **Exponential Growth**: Each level requires progressively more XP
- Default cooldown prevents spam (configurable)

### Level Formula
The new leveling system uses exponential progression:
```
XP required for level N = baseXpRequired * (xpMultiplier^(N-2))
```

**Default Settings:**
- Base XP Required: 100
- XP Multiplier: 1.5
- XP per Message: 15

**Example Level Requirements:**
- Level 1: 0 XP
- Level 2: 100 XP
- Level 3: 150 XP  
- Level 4: 225 XP
- Level 5: 338 XP
- Level 10: 1,909 XP
- Level 20: 77,023 XP
- Level 30: 3,106,569 XP
- Level 40: 125,290,394 XP
- Level 50: 5,054,470,284 XP

### Enhanced Level Command
The `/level` command now shows:
- **Rank** in server
- **Current Level** and total XP
- **Progress Bar** with percentage
- **XP in current level** vs required
- **XP needed** for next level
- **Total XP required** for next level
- **Booster Status** (if user has booster role)

### 🚀 Booster Role System
- **Configure a special role** that grants 2x XP multiplier
- **Automatic detection**: Bot checks for booster role on each message
- **Visual indicators**: Booster status shown in level command and level-up messages
- **Customizable multiplier**: Change the XP boost amount in config.json
- **Server boosters reward**: Perfect for Discord Nitro server boosters or VIP members

## Database Schema

The bot uses SQLite with the following table:

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    username TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    last_message_time INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Project Structure
```
discord-bot/
├── src/
│   ├── commands/           # Slash commands
│   │   ├── level.js        # Enhanced level checking with progress details
│   │   └── leaderboard.js  # Server XP leaderboard
│   ├── database/           # Database logic
│   │   └── database.js     # SQLite operations with exponential XP system
│   ├── index.js           # Main bot file with config support
│   └── deploy-commands.js # Command deployment utility
├── data/                  # Database storage directory
├── config.json           # Bot configuration (XP rates, role rewards)
├── config.example.json   # Configuration template
├── .env                  # Environment variables (tokens, IDs)
├── .env.example          # Environment template
├── package.json          # Dependencies and scripts
├── Dockerfile            # Docker configuration
└── docker-compose.yml    # Docker Compose setup
```

### Adding New Commands

1. Create a new file in `src/commands/`
2. Export an object with `data` and `execute` properties
3. Run `pnpm run deploy-commands` to register the command

Example:
```javascript
import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mycommand')
        .setDescription('My custom command'),
    
    async execute(interaction, database) {
        await interaction.reply('Hello!');
    }
};
```

## Troubleshooting

### Common Issues

1. **"DiscordAPIError: Invalid Form Body"**
   - Check that your `CLIENT_ID` and `GUILD_ID` are correct
   - Ensure your bot has the necessary permissions

2. **"Database locked" errors**
   - Stop all bot instances before restarting
   - Check file permissions on the database directory

3. **Commands not appearing**
   - Run `pnpm run deploy-commands`
   - Wait a few minutes for Discord to update
   - Check bot permissions in server settings

4. **Bot not responding to messages**
   - Verify the bot has "Send Messages" and "Use Slash Commands" permissions
   - Check that the bot can see the channels

### Required Bot Permissions

- View Channels
- Send Messages
- Use Slash Commands
- Embed Links
- Read Message History
- Manage Roles (for level rewards)

## License

MIT License - feel free to modify and use for your own projects!