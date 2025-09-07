import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://ark-api.127.0.0.1.nip.io:8080/openai/v1',
  apiKey: 'dummy',
});

async function testStreaming() {
  try {
    console.log('Testing with stream: true...');
    const completion = await openai.chat.completions.create({
      model: 'agent/sample-agent',
      messages: [{ role: 'user', content: 'test streaming' }],
      stream: true,
    });

    console.log('Type of completion:', typeof completion);
    console.log('Is async iterator?', Symbol.asyncIterator in completion);
    
    if (Symbol.asyncIterator in completion) {
      console.log('Processing as stream...');
      let fullResponse = '';
      let chunkCount = 0;
      for await (const chunk of completion) {
        chunkCount++;
        console.log('Chunk', chunkCount, ':', JSON.stringify(chunk));
        const content = chunk.choices[0]?.delta?.content || '';
        if (!content && chunk.choices[0]?.message?.content) {
          // Maybe it's returning the full message in a single chunk
          fullResponse = chunk.choices[0].message.content;
        } else {
          fullResponse += content;
        }
      }
      console.log('Total chunks:', chunkCount);
      console.log('Full response:', fullResponse);
    } else {
      console.log('Not a stream, raw response:', completion);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testStreaming();