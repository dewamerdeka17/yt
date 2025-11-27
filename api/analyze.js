const fetch = require('node-fetch');

// Important keywords for content detection
const IMPORTANT_KEYWORDS = [
  'cara', 'tutorial', 'tips', 'trik', 'rahasia', 'step by step',
  'panduan', 'guide', 'solusi', 'masalah', 'fix', 'rekomendasi',
  'terbaik', 'urgent', 'penting', 'wajib', 'harus', 'kesimpulan',
  'intinya', 'pokoknya', 'ringkasan', 'summary', 'how to'
];

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Extract video ID from URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Get video info and analyze
    const result = await analyzeYouTubeVideo(videoId, url);
    
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

async function analyzeYouTubeVideo(videoId, originalUrl) {
  // Get video info from YouTube oEmbed API
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const oembedResponse = await fetch(oembedUrl);
  
  if (!oembedResponse.ok) {
    throw new Error('Could not fetch video information');
  }
  
  const oembedData = await oembedResponse.json();
  
  // Simulate analysis (in real implementation, you'd use yt-dlp or similar)
  const segments = await simulateContentAnalysis(videoId);
  
  return {
    video_id: videoId,
    title: oembedData.title,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    segments: segments,
    original_url: originalUrl
  };
}

async function simulateContentAnalysis(videoId) {
  // This is a simulation - in production you'd use yt-dlp to get actual transcript
  const segments = [];
  const baseTime = 60; // Start at 1 minute
  
  // Generate 3-5 realistic segments
  const segmentCount = 3 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < segmentCount; i++) {
    const start = baseTime + (i * 180); // 3-minute intervals
    const duration = 30 + Math.floor(Math.random() * 60); // 30-90 seconds
    const end = start + duration;
    
    const sampleTexts = [
      "Dalam bagian ini kita akan membahas cara terbaik untuk mengoptimalkan workflow Anda",
      "Tips penting yang harus Anda ketahui tentang topik ini adalah",
      "Berikut tutorial step by step untuk memulai proyek Anda",
      "Rahasia sukses yang jarang dibagikan oleh para expert",
      "Solusi untuk masalah umum yang sering dihadapi pemula"
    ];
    
    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    
    segments.push({
      start: start,
      end: end,
      start_formatted: formatTime(start),
      end_formatted: formatTime(end),
      text: text,
      score: 6 + Math.floor(Math.random() * 5), // Score 6-10
      youtube_url: `https://youtube.com/embed/${videoId}?start=${start}&end=${end}`,
      watch_url: `https://www.youtube.com/watch?v=${videoId}&t=${start}s`
    });
  }
  
  // Sort by score (highest first)
  segments.sort((a, b) => b.score - a.score);
  
  return segments;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}