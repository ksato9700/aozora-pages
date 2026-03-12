
import { fetchTextContent } from '../web/src/lib/viewer.ts';
import assert from 'node:assert';

async function testFetchTextContent() {
    console.log('--- Testing fetchTextContent SSRF Protection ---');

    // Test Case 1: Allowed Host (aozora.gr.jp)
    try {
        console.log('Testing allowed host (www.aozora.gr.jp)...');
        // This will likely fail with a real network error if not mocked, 
        // but it should NOT throw "Unauthorized host"
        await fetchTextContent('https://www.aozora.gr.jp/index.html'); 
    } catch (e) {
        assert.ok(!e.message.includes('Unauthorized host'), 'Should not block allowed host');
    }

    // Test Case 2: Unauthorized Host (google.com)
    try {
        console.log('Testing unauthorized host (google.com)...');
        await fetchTextContent('https://www.google.com');
        assert.fail('Should have thrown an error for unauthorized host');
    } catch (e) {
        assert.ok(e.message.includes('Unauthorized host'), 'Should block unauthorized host');
        console.log('✅ Correctly blocked google.com');
    }

    // Test Case 3: Unauthorized Host (localhost)
    try {
        console.log('Testing unauthorized host (localhost)...');
        await fetchTextContent('http://localhost:8080/secret');
        assert.fail('Should have thrown an error for localhost');
    } catch (e) {
        assert.ok(e.message.includes('Unauthorized host'), 'Should block localhost');
        console.log('✅ Correctly blocked localhost');
    }

    // Test Case 4: R2 Host (Allowed)
    try {
        console.log('Testing allowed R2 host (my-bucket.r2.dev)...');
        await fetchTextContent('https://my-bucket.r2.dev/file.txt');
    } catch (e) {
        assert.ok(!e.message.includes('Unauthorized host'), 'Should not block r2.dev host');
        console.log('✅ Correctly allowed r2.dev');
    }

    // Test Case 5: Invalid Protocol (ftp)
    try {
        console.log('Testing invalid protocol (ftp)...');
        await fetchTextContent('ftp://www.aozora.gr.jp/file.txt');
        assert.fail('Should have thrown an error for invalid protocol');
    } catch (e) {
        assert.ok(e.message.includes('Invalid protocol'), 'Should block non-http(s) protocols');
        console.log('✅ Correctly blocked ftp://');
    }

    console.log('--- All SSRF tests passed! ---');
}

testFetchTextContent().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
