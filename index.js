const Scrappey = require('scrappey-wrapper');
const fs = require('fs').promises;
const { Client, GatewayIntentBits } = require('discord.js');
const cheerio = require('cheerio');
const chokidar = require('chokidar');

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
        let schedulesNextMonth = [];

        if (schedulesNextMonthData) {
            schedulesNextMonth = JSON.parse(schedulesNextMonthData);
        } else {
            // Jika file schedules-nextmonth.json kosong, tambahkan teks "Belum Ada Update Dari Pusat"
            schedulesNextMonth = [{ id: 'empty', day: 'N/A', show: 'Belum Ada Update Dari Pusat', link: '#' }];
        }

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

const watchSchedules = () => {
    const watcher = chokidar.watch(['schedules.json', 'schedules-nextmonth.json'], {
        persistent: true,
        awaitWriteFinish: true,
    });

    watcher
        .on('change', async () => {
            console.log('Detected changes in schedule files. Sending update to Discord...');
            await sendToDiscord(); // Membuat fungsi sendToDiscord agar bisa dipanggil saat terjadi perubahan
        })
        .on('error', (error) => {
            console.error(`Error watching schedule files: ${error}`);
        });
};

// Function to generate an embed from schedule data
const generateEmbed = (title, schedules) => {
    const embed = {
        title: title,
        color: 0x3498db, // Replace with your desired color
        fields: [],
    };

    if (schedules.length === 0) {
        // Jika tidak ada jadwal, tambahkan teks "Belum Ada Update Dari Pusat"
        embed.fields.push({
            name: 'ID: empty',
            value: '🗓️ Day: N/A\n⏰ Show: Belum Ada Update Dari Pusat\nLink: #',
        });
    } else {
        for (const schedule of schedules) {
            embed.fields.push({
                name: `ID: ${schedule.id}`,
                value: `🗓️ Day: ${schedule.day}\n⏰ Show: ${schedule.show}\nLink: [Schedule Link](${schedule.link})`,
            });
        }
    }

    return embed;
};
// Fungsi untuk memeriksa pengingat dan mengirim pesan
const checkReminders = async () => {
    try {
        const now = new Date();
        const schedulesData = await fs.readFile('schedules.json', 'utf-8');
        const schedules = JSON.parse(schedulesData);

        for (const schedule of schedules) {
            const showTime = new Date(schedule.showTime); // Menyimpulkan bahwa ada properti 'showTime' dalam data jadwal Anda

            // Sesuaikan kondisi berdasarkan logika Anda untuk mengirim pengingat
            if (now.getTime() === showTime.getTime()) {
                const channelName = 'idn-notifier'; // Ganti dengan nama saluran Anda
                const channel = client.channels.cache.find(ch => ch.name === channelName);

                if (channel) {
                    await channel.send(`Show ID: ${schedule.id} is starting!`);
                } else {
                    console.error(`Error: Channel '${channelName}' not found.`);
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
};

// Function to send messages in chunks to handle content length limit
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

        watchSchedules(); // Memulai pemantauan perubahan pada file-file jadwal

        // Setelah file-file dibuat, barulah jalankan bot Discord
        client.once('ready', () => {
            console.log('Bot is ready!');
            sendToDiscord();
        });

        client.login('TOKEN_BOT');
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
