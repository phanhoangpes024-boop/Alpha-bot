import TelegramBot from 'node-telegram-bot-api';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { scrapeArticle, getSupportedSources } from './scrapers.js';

dotenv.config();

// Khởi tạo các service
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Hàm phát hiện loại link
function detectLinkType(url) {
    if (url.includes('medrxiv.org')) return 'medrxiv';
    if (url.includes('pmc.ncbi.nlm.nih.gov') || url.includes('PMC')) return 'pmc';
    return 'general';
}

// Hàm dùng AI viết lại bài
async function generateVietnameseArticle(scrapedData, linkType) {
    let prompt = '';
    
    if (linkType === 'medrxiv') {
        prompt = `
Bạn là một biên tập viên y khoa chuyên nghiệp. Hãy viết lại bài báo sau thành tiếng Việt:

**Tiêu đề gốc:** ${scrapedData.title}
**Tác giả:** ${scrapedData.authors}
**Tóm tắt:** ${scrapedData.abstract}
**Nội dung toàn văn:** ${scrapedData.fullText}

Yêu cầu:
1. Viết lại tiêu đề hấp dẫn bằng tiếng Việt (không quá 150 ký tự)
2. Tạo mô tả ngắn gọn (200-300 ký tự) thu hút người đọc
3. Viết nội dung bài báo đầy đủ bằng HTML với các thẻ <h2>, <p>, <ul>, <li>
4. Giữ nguyên thuật ngữ y khoa quan trọng, giải thích bằng tiếng Việt
5. Nội dung dễ hiểu, chuyên nghiệp

Trả về JSON với format:
{
  "title": "Tiêu đề tiếng Việt",
  "description": "Mô tả ngắn",
  "content": "Nội dung HTML đầy đủ",
  "tags": ["Tag1", "Tag2", "Tag3"]
}
`;
    } else if (linkType === 'pmc') {
        prompt = `
Bạn là một biên tập viên y khoa chuyên nghiệp. Hãy viết lại bài báo PMC sau thành tiếng Việt:

**Tiêu đề:** ${scrapedData.title}
**Tác giả:** ${scrapedData.authors}
**Tạp chí:** ${scrapedData.journal}
**Tóm tắt:** ${scrapedData.abstract}
**Nội dung:** ${scrapedData.fullText}

Yêu cầu:
1. Viết lại tiêu đề hấp dẫn bằng tiếng Việt (không quá 150 ký tự)
2. Tạo mô tả ngắn gọn (200-300 ký tự)
3. Viết nội dung bài báo đầy đủ bằng HTML
4. Giữ nguyên các thuật ngữ y khoa quan trọng

Trả về JSON với format:
{
  "title": "Tiêu đề tiếng Việt",
  "description": "Mô tả ngắn",
  "content": "Nội dung HTML",
  "tags": ["Tag1", "Tag2", "Tag3"]
}
`;
    } else {
        prompt = `
Viết lại bài báo khoa học sau thành tiếng Việt:

**Tiêu đề gốc:** ${scrapedData.title}
**Ngày:** ${scrapedData.date || 'Không rõ'}
**Nguồn:** ${scrapedData.source || 'Không rõ'}
**Tóm tắt:** ${scrapedData.summary || 'Không có'}
**Nội dung đầy đủ:** ${scrapedData.fullStory || scrapedData.summary || 'Không có'}

YÊU CẦU:
1. Viết lại tiêu đề hấp dẫn bằng tiếng Việt (không quá 150 ký tự)
2. Tạo mô tả ngắn gọn (200-300 ký tự) thu hút người đọc
3. Viết nội dung bài báo HOÀN CHỈNH bằng HTML với các thẻ <h2>, <p>, <ul>, <li>
4. Nếu nội dung gốc ngắn, hãy MỞ RỘNG và BỔ SUNG thêm chi tiết dựa trên tóm tắt
5. Nội dung phải có ít nhất 3-4 đoạn văn, mỗi đoạn 3-5 câu

Trả về JSON với format:
{
  "title": "Tiêu đề tiếng Việt",
  "description": "Mô tả ngắn",
  "content": "<h2>Giới thiệu</h2><p>...</p><h2>Phát hiện chính</h2><p>...</p><h2>Ý nghĩa</h2><p>...</p>",
  "tags": ["Khoa học", "Y học", "Nghiên cứu"]
}
`;
    }
    
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: "Bạn là biên tập viên y khoa chuyên nghiệp, viết bài bằng tiếng Việt." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 4000
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    
    // Kiểm tra kết quả từ AI
    if (!result.title) {
        throw new Error('AI không tạo được tiêu đề');
    }
    
    if (!result.description) {
        result.description = result.title.substring(0, 200);
    }
    
    if (!result.content) {
        throw new Error('AI không tạo được nội dung');
    }
    
    if (!result.tags || result.tags.length === 0) {
        result.tags = ['Y học', 'Nghiên cứu'];
    }
    
    return result;
}

// Hàm lưu bài viết vào Supabase
async function saveArticleToSupabase(articleData, scrapedData) {
    // Kiểm tra dữ liệu trước khi lưu
    if (!articleData.title || articleData.title.trim() === '') {
        throw new Error('AI không tạo được tiêu đề. Vui lòng thử lại!');
    }
    
    if (!articleData.description || articleData.description.trim() === '') {
        articleData.description = articleData.title.substring(0, 200) + '...';
    }
    
    if (!articleData.content || articleData.content.trim() === '') {
        throw new Error('AI không tạo được nội dung. Vui lòng thử lại!');
    }
    
    // Luôn dùng ngày hiện tại (theo múi giờ Việt Nam)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    const currentDate = vietnamTime.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 1. Tạo bài viết
    const { data: article, error: articleError } = await supabase
        .from('articles')
        .insert([{
            title: articleData.title.trim(),
            description: articleData.description.trim(),
            content: articleData.content,
            date: currentDate, // Luôn dùng ngày hiện tại
            institution: scrapedData.journal || scrapedData.source || scrapedData.institution || 'Nghiên cứu Y khoa',
            image: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=800',
            likes: 0,
            views: 0
        }])
        .select()
        .single();
    
    if (articleError) throw articleError;
    
    // 2. Thêm tác giả
    if (scrapedData.authors) {
        const authorsArray = scrapedData.authors.split(',').map(a => a.trim()).slice(0, 3);
        
        for (const authorName of authorsArray) {
            let { data: existingAuthor } = await supabase
                .from('authors')
                .select('id')
                .eq('name', authorName)
                .single();
            
            let authorId;
            if (!existingAuthor) {
                const { data: newAuthor } = await supabase
                    .from('authors')
                    .insert([{ name: authorName }])
                    .select()
                    .single();
                authorId = newAuthor.id;
            } else {
                authorId = existingAuthor.id;
            }
            
            await supabase
                .from('article_authors')
                .insert([{ article_id: article.id, author_id: authorId }]);
        }
    }
    
    // 3. Thêm tags
    if (articleData.tags) {
        for (const tagName of articleData.tags) {
            let { data: existingTag } = await supabase
                .from('tags')
                .select('id')
                .eq('name', tagName)
                .single();
            
            let tagId;
            if (!existingTag) {
                const { data: newTag } = await supabase
                    .from('tags')
                    .insert([{ name: tagName }])
                    .select()
                    .single();
                tagId = newTag.id;
            } else {
                tagId = existingTag.id;
            }
            
            await supabase
                .from('article_tags')
                .insert([{ article_id: article.id, tag_id: tagId }]);
        }
    }
    
    return article;
}

// Xử lý lệnh /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const sources = getSupportedSources();
    
    let message = `🎉 Chào mừng đến với InfectiXiv Bot!\n\n`;
    message += `📝 Gửi link bài báo để tôi tự động tạo bài viết tiếng Việt.\n\n`;
    message += `✅ Các nguồn được hỗ trợ:\n`;
    
    sources.forEach((src, index) => {
        message += `${index + 1}. **${src.name}**\n`;
        message += `   • ${src.pattern}\n`;
        message += `   • VD: \`${src.example}\`\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Xử lý khi nhận link
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Bỏ qua các lệnh
    if (text.startsWith('/')) return;
    
    // Kiểm tra xem có phải link không
    if (!text.includes('http')) {
        bot.sendMessage(chatId, '❌ Vui lòng gửi link bài báo hợp lệ!');
        return;
    }
    
    try {
        // Thông báo đang xử lý
        const processingMsg = await bot.sendMessage(chatId, '⏳ Đang xử lý...');
        
        // Bước 1: Crawl dữ liệu
        await bot.editMessageText(
            `⏳ Đang crawl dữ liệu từ bài viết...`,
            { chat_id: chatId, message_id: processingMsg.message_id }
        );
        
        const scrapedResult = await scrapeArticle(text);
        
        if (!scrapedResult.success) {
            throw new Error(scrapedResult.message);
        }
        
        const scrapedData = scrapedResult.data;
        const linkType = detectLinkType(text);
        
        // Log để debug
        console.log('📊 Dữ liệu crawl được:', {
            title: scrapedData.title?.substring(0, 50) + '...',
            hasAbstract: !!scrapedData.abstract,
            hasFullText: !!scrapedData.fullText,
            hasSummary: !!scrapedData.summary,
            hasFullStory: !!scrapedData.fullStory,
            linkType
        });
        
        // Kiểm tra xem có đủ dữ liệu để viết bài không
        const hasContent = (
            (linkType === 'medrxiv' && (scrapedData.abstract || scrapedData.fullText)) ||
            (linkType === 'pmc' && (scrapedData.abstract || scrapedData.fullText)) ||
            (linkType === 'general' && (scrapedData.summary || scrapedData.fullStory))
        );
        
        if (!hasContent) {
            throw new Error('Không lấy được nội dung bài viết. Vui lòng kiểm tra lại link!');
        }
        
        // Bước 2: AI viết bài
        await bot.editMessageText(
            `⏳ AI đang viết bài tiếng Việt...`,
            { chat_id: chatId, message_id: processingMsg.message_id }
        );
        
        const articleData = await generateVietnameseArticle(scrapedData, linkType);
        
        // Bước 3: Lưu vào database
        await bot.editMessageText(
            `⏳ Đang lưu bài viết vào database...`,
            { chat_id: chatId, message_id: processingMsg.message_id }
        );
        
        const savedArticle = await saveArticleToSupabase(articleData, scrapedData);
        
        // Bước 4: Thông báo thành công
        await bot.editMessageText(
            `✅ Tạo bài viết thành công!\n\n` +
            `📰 **${articleData.title}**\n\n` +
            `🔗 Xem tại: http://localhost:3000/news/${savedArticle.id}\n\n` +
            `📊 Tags: ${articleData.tags.join(', ')}`,
            { 
                chat_id: chatId, 
                message_id: processingMsg.message_id,
                parse_mode: 'Markdown'
            }
        );
        
    } catch (error) {
        console.error('Lỗi:', error);
        bot.sendMessage(chatId, 
            `❌ Có lỗi xảy ra:\n${error.message}\n\n` +
            `Vui lòng thử lại hoặc kiểm tra link!`
        );
    }
});

console.log('🤖 Bot đã khởi động!');
console.log('📱 Gửi link bài báo để bắt đầu...');