const Scrappey = require('scrappey-wrapper');
const fs = require('fs').promises;
const { Client, GatewayIntentBits } = require('discord.js');
const cheerio = require('cheerio');

const apiKey = 'YOUR_API_KEY'; // Replace with your Scrappey API key (https://scrappey.com/)
const scrappey = new Scrappey(apiKey);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ],
});

const sendToDiscord = async () => {
    try {
        const schedulesData = await fs.readFile('schedules.json', 'utf-8');
        const schedules = JSON.parse(schedulesData);

        const schedulesNextMonthData = await fs.readFile('schedules-nextmonth.json', 'utf-8');
        const schedulesNextMonth = JSON.parse(schedulesNextMonthData);

        const channelName = 'idn-notifer'; // Replace with your channel name
        const channel = client.channels.cache.find(ch => ch.name === channelName);

        if (!channel) {
            console.error(`Error: Channel '${channelName}' not found.`);
            return;
        }

        // Send current month schedules as embed
        const currentMonthEmbed = generateEmbed('Schedules Current Month', schedules);
        await channel.send({ embeds: [currentMonthEmbed] });

        // Send next month schedules as embed
        const nextMonthEmbed = generateEmbed('Schedules Next Month', schedulesNextMonth);
        await channel.send({ embeds: [nextMonthEmbed] });

        console.log('Successfully sent data to Discord');
    } catch (error) {
        console.error(error);
    }
};

// Function to generate an embed from schedule data
const generateEmbed = (title, schedules) => {
    const embed = {
        title: title,
        color: 0x3498db, // Replace with your desired color
        fields: [],
    };

    for (const schedule of schedules) {
        embed.fields.push({
            name: `ID: ${schedule.id}`,
            value: `🗓️ Day: ${schedule.day}\n⏰ Show: ${schedule.show}\nLink: [Schedule Link](${schedule.link})`,
        });
    }

    return embed;
};

// Membatasi Text Cuma 2000 kata sekali kirim
const sendChunkedMessage = async (channel, content) => {
    const chunks = content.match(/[\s\S]{1,1999}/g) || [];
    for (const chunk of chunks) {
        await channel.send(chunk);
    }
};

const getSchedule = async () => {
    try {
        const createSession = await scrappey.createSession({ "session": "test" });
        const session = createSession.session;

        const getResponse = await scrappey.get({
            session: session,
            url: 'https://jkt48.com/calendar/list?lang=id',
        });

        const $ = cheerio.load(getResponse.solution.response);

        const schedules = [];
        const linkNextMonth = $(".entry-schedule__header--after").find("a").attr('href');
        const linkNextMonthFull = `https://jkt48.com${linkNextMonth}`;

        const schedulesCurrentMonth = $('.entry-schedule__calendar > table a').map((index, element) => {
            let link = `https://jkt48.com${$(element).attr('href')}`;

            let schedule = {
                id: getScheduleId(link),
                day: $(element).closest('td').prev().text().trim(),
                show: $(element).text().trim(),
                link: link,
            };

            return schedule;
        }).get();

        await fs.writeFile('schedules.json', JSON.stringify(schedulesCurrentMonth, null, 2));
        console.log('Successfully written current month data to file');

        const schedulesNextMonth = await getScheduleNextMonth(linkNextMonthFull, session);
        await fs.writeFile('schedules-nextmonth.json', JSON.stringify(schedulesNextMonth, null, 2));
        console.log('Successfully written next month data to file');

        await scrappey.destroySession(session);

        // Setelah file-file dibuat, barulah jalankan bot Discord
        client.once('ready', () => {
            console.log('Bot is ready!');
            sendToDiscord();
        });

        client.login('YOUR_TOKEN_DISCORD'); // Add your bot token discord
    } catch (error) {
        console.error(error);
    }
};

const getScheduleNextMonth = async (url, session) => {
    try {
        const getResponse = await scrappey.get({
            session: session,
            url: url,
        });

        const $ = cheerio.load(getResponse.solution.response);
        const schedules = [];

        $('.entry-schedule__calendar > table a').each((index, element) => {
            let link = `https://jkt48.com${$(element).attr('href')}`;

            let schedule = {
                id: getScheduleId(link),
                day: $(element).closest('td').prev().text().trim(),
                show: $(element).text().trim(),
                link: link,
            };

            schedules.push(schedule);
        });

        return schedules;
    } catch (error) {
        console.error(error);
        return [];
    }
};

const getScheduleId = (link) => {
    const linkParts = link.split('/');
    const typeEvent = linkParts[3] ?? '';
    let id = '';

    if (typeEvent === 'theater' || typeEvent === 'event') {
        const splitText = linkParts[linkParts.length - 1]?.split('?')[0] ?? '';
        id = `${typeEvent}_${splitText}`;
    } else if (typeEvent === 'calendar') {
        const year = linkParts[6] ?? '';
        const month = linkParts[8] ?? '';
        const day = linkParts[linkParts.length - 1]?.split('?')[0] ?? '';
        id = `${typeEvent}_${year}${month}${day}`;
    }

    return id;
};

getSchedule();
