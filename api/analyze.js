const fetch = require('node-fetch');

// Environment variables
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Cache for video data
const videoCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Groq API configuration
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama3-8b-8192';

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Check cache
    const cacheKey = videoId;
    const cached = videoCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return res.status(200).json(cached.data);
    }

    // Process video
    const result = await processVideoWithAI(videoId, url);
    
    // Cache result
    videoCache.set(cacheKey, {
      timestamp: Date.now(),
      data: result
    });

    cleanupCache();

    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
};

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\/\?]+)/,
    /youtube\.com\/watch\?.*v=([^&]+)/,
    /youtu\.be\/([^?]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of videoCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      videoCache.delete(key);
    }
  }
}

async function processVideoWithAI(videoId, originalUrl) {
  try {
    const videoInfo = await getYouTubeVideoInfo(videoId);
    if (!videoInfo) {
      throw new Error('Could not fetch video information from YouTube API');
    }

    const analysisResult = await analyzeContentWithAI({
      videoId,
      title: videoInfo.title,
      description: videoInfo.description,
      duration: videoInfo.duration,
      channel: videoInfo.channelTitle
    });

    return {
      success: true,
      video_id: videoId,
      title: videoInfo.title,
      description: videoInfo.description,
      duration: videoInfo.duration,
      duration_formatted: formatTime(videoInfo.duration),
      thumbnail: videoInfo.thumbnail,
      channel: videoInfo.channelTitle,
      viewCount: videoInfo.viewCount,
      publishedAt: videoInfo.publishedAt,
      segments: analysisResult.segments,
      analysis_type: analysisResult.analysis_type,
      original_url: originalUrl,
      analyzed_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Process video error:', error);
    throw error;
  }
}

async function getYouTubeVideoInfo(videoId) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const contentDetails = item.contentDetails;
    const statistics = item.statistics;

    return {
      title: snippet.title,
      description: snippet.description,
      duration: parseISODuration(contentDetails.duration),
      thumbnail: snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url,
      channelTitle: snippet.channelTitle,
      viewCount: statistics.viewCount || 0,
      likeCount: statistics.likeCount || 0,
      publishedAt: snippet.publishedAt,
      tags: snippet.tags || []
    };
  } catch (error) {
    console.error('YouTube API Error:', error);
    throw error;
  }
}

function parseISODuration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;

  const hours = (match[1] ? parseInt(match[1].slice(0, -1)) : 0);
  const minutes = (match[2] ? parseInt(match[2].slice(0, -1)) : 0);
  const seconds = (match[3] ? parseInt(match[3].slice(0, -1)) : 0);

  return hours * 3600 + minutes * 60 + seconds;
}

async function analyzeContentWithAI(videoData) {
  try {
    if (GROQ_API_KEY && GROQ_API_KEY.startsWith('gsk_')) {
      console.log('Using Groq AI for analysis...');
      return await analyzeWithGroqAPI(videoData);
    } else {
      console.log('Using rule-based analysis');
      return await analyzeWithRules(videoData);
    }
  } catch (error) {
    console.error('AI Analysis Error:', error.message);
    console.log('Falling back to rule-based analysis');
    return await analyzeWithRules(videoData);
  }
}

async function analyzeWithGroqAPI(videoData) {
  const prompt = `
Analyze this YouTube video and identify 3-5 important segments for short clips.

VIDEO:
Title: ${videoData.title}
Description: ${videoData.description ? videoData.description.substring(0, 300) + '...' : 'No description'}
Duration: ${videoData.duration} seconds (${formatTime(videoData.duration)})
Channel: ${videoData.channel}

Identify segments that contain:
- Tutorials and how-to guides
- Key insights and important points  
- Useful tips and best practices
- Summary and conclusions

Respond with JSON format only:
{
  "segments": [
    {
      "start": 120,
      "end": 180,
      "title": "Segment Title",
      "description": "Brief description of content",
      "score": 8,
      "reason": "Why this segment is important"
    }
  ]
}

Ensure each segment is 30-90 seconds and provide exact timestamps in seconds.
`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an AI that analyzes YouTube video content. Always respond with valid JSON format only. Do not include any other text.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 2000,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status}`);
    }

    const result = await response.json();
    
    return parseGroqAIResponse(result, videoData.videoId);
    
  } catch (error) {
    console.error('Groq API request failed:', error.message);
    throw error;
  }
}

function parseGroqAIResponse(aiResponse, videoId) {
  try {
    if (!aiResponse.choices || !aiResponse.choices[0] || !aiResponse.choices[0].message) {
      throw new Error('Invalid Groq API response structure');
    }

    const content = aiResponse.choices[0].message.content;
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsedContent = JSON.parse(jsonMatch[0]);
    
    if (!parsedContent.segments || !Array.isArray(parsedContent.segments)) {
      throw new Error('Invalid segments format in AI response');
    }

    const formattedSegments = parsedContent.segments.map((segment, index) => {
      const start = Math.max(0, segment.start || (index * 120 + 30));
      const end = Math.max(start + 30, segment.end || (start + 60));
      
      return {
        start: start,
        end: end,
        start_formatted: formatTime(start),
        end_formatted: formatTime(end),
        title: segment.title || `Important Segment ${index + 1}`,
        description: segment.description || "AI-identified important moment",
        score: Math.min(10, Math.max(1, segment.score || 7)),
        reason: segment.reason || "Identified as important content by AI analysis",
        youtube_url: `https://youtube.com/embed/${videoId}?start=${Math.floor(start)}&end=${Math.floor(end)}`,
        watch_url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`
      };
    });

    return {
      segments: formattedSegments.slice(0, 5), // Max 5 segments
      analysis_type: 'ai_groq'
    };

  } catch (error) {
    console.error('Error parsing Groq AI response:', error.message);
    throw new Error(`AI response parsing failed: ${error.message}`);
  }
}

async function analyzeWithRules(videoData) {
  const segments = [];
  const duration = videoData.duration;
  
  const segmentCount = Math.min(5, Math.max(3, Math.floor(duration / 120)));
  
  for (let i = 0; i < segmentCount; i++) {
    const segmentSize = duration / segmentCount;
    const start = Math.floor(i * segmentSize + 30);
    const end = Math.floor(Math.min(start + 60, (i + 1) * segmentSize - 10));
    
    const segmentTypes = [
      { title: "Introduction & Overview", score: 7 },
      { title: "Key Concept Explanation", score: 9 },
      { title: "Practical Tutorial", score: 8 },
      { title: "Tips & Best Practices", score: 8 },
      { title: "Conclusion & Summary", score: 7 }
    ];
    
    const segmentType = segmentTypes[i] || segmentTypes[0];
    
    segments.push({
      start: start,
      end: end,
      start_formatted: formatTime(start),
      end_formatted: formatTime(end),
      title: segmentType.title,
      description: `Important segment covering ${segmentType.title.toLowerCase()}`,
      score: segmentType.score,
      reason: "Automatically identified based on video structure analysis",
      youtube_url: `https://youtube.com/embed/${videoData.videoId}?start=${start}&end=${end}`,
      watch_url: `https://www.youtube.com/watch?v=${videoData.videoId}&t=${start}s`
    });
  }
  
  return {
    segments: segments,
    analysis_type: 'rule_based'
  };
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
