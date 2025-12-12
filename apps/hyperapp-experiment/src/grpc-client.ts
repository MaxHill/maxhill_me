import { account } from './generated/account_pb_static';

export async function pingServer(pingValue: number): Promise<number> {
  // Create protobuf message
  const request = account.PingRequest.create({ ping: pingValue });
  
  // Encode to binary
  const buffer = account.PingRequest.encode(request).finish();
  
  // Send via HTTP POST
  const response = await fetch('http://localhost:8080/ping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-protobuf',
    },
    body: buffer,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  
  // Decode the response
  const responseBuffer = new Uint8Array(await response.arrayBuffer());
  const pingResponse = account.PingResponse.decode(responseBuffer);
  
  console.log('Ping:', pingValue, '→ Pong:', pingResponse.pong);
  return Number(pingResponse.pong);
}
