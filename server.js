require('dotenv').config(); // 환경 변수 로드
const express = require('express');
const { Together } = require('together-ai');

const server = express();
server.use(express.json()); // body 파싱을 위한 미들웨어 설정

const port = 3000; // 서버 포트 번호
const together = new Together(process.env.TOGETHER_API_KEY); // Together API 클라이언트 인스턴스 생성

// 사용 가능한 AI 모델 정의
const AI_MODEL = Object.freeze({
    LLAMA: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free", // Llama 모델
    DEEPSEEK: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free", // DeepSeek 모델
    GUARD: "meta-llama/Meta-Llama-Guard-3-8B", // 안전 필터링 모델
    FLUX: "black-forest-labs/FLUX.1-schnell-Free", // 이미지 생성 모델
    // STABLE_DIFFUSION: "stabilityai/stable-diffusion-xl-base-1.0" // Stable Diffusion 모델 (현재 주석 처리)
});

// 이미지 생성 기본 설정
const IMAGE_CONFIG = {
    width: 1024,
    height: 1024,
    n: 1
};

// 채팅 시스템 메시지
const CHAT_SYSTEM_MESSAGE = process.env.CHAT_SYSTEM_MESSAGE ?? `마크다운을 사용하지 말고, 한국어만 사용하고 한국어 글자만 사용해. 혹시라도 영어로 답변하면 다시 한번 한국어와 한글을 사용하는지 확인하고, 그렇지 않다면 삭제해.`;

/**
 * 모델에 따라 이미지 생성 단계를 반환합니다.
 * @param {string} model - AI 모델 이름
 * @returns {number} 이미지 생성 단계 수
 * @throws {Error} 지원하지 않는 모델일 경우 에러 발생
 */
function getStepsFromModel(model) {
    switch (model) {
        case AI_MODEL.FLUX:
            return 4;
        // case AI_MODEL.STABLE_DIFFUSION:
        //   return 40;
        default:
            throw new Error('Not implemented');
    }
}

/**
 * 주어진 모델과 프롬프트로 이미지를 생성합니다.
 * @param {string} model - 사용할 AI 모델 이름
 * @param {string} prompt - 이미지 생성 프롬프트
 * @returns {Promise<string>} 생성된 이미지 URL
 */
async function createImage(model, prompt) {
    console.log(process.env.IMAGE_MODE); // 이미지 모드 환경 변수 로깅
    const body = {
        model,
        prompt,
        ...IMAGE_CONFIG,
        steps: getStepsFromModel(model)
    };
    const result = await together.images.create(body);
    return result.data[0].url;
}

/**
 * 주어진 모델과 프롬프트로 채팅을 수행합니다.
 * @param {string} model - 사용할 AI 모델 이름
 * @param {string} prompt - 채팅 프롬프트
 * @returns {Promise<string>} AI 모델의 답변
 * @throws {Error} 프롬프트가 없거나 AI 모델 호출 중 오류 발생 시 에러 발생
 */
async function chatWithModel(model, prompt) {
    if (!prompt) {
        throw new Error('프롬프트가 필요합니다!');
    }
    console.log(`프롬프트: ${prompt}`);
    try {
        const result = await together.chat.completions.create({
            model,
            safety_model: AI_MODEL.GUARD, // 안전 필터링 모델 사용
            messages: [
                { role: "system", content: CHAT_SYSTEM_MESSAGE }, // 시스템 메시지 설정
                { role: 'user', content: prompt }, // 사용자 프롬프트 설정
            ],
        });
        console.log(result);
        return result.choices[0].message.content; // 첫 번째 선택지의 메시지 내용 반환
    } catch (error) {
        console.error("AI 모델 호출 중 오류:", error);
        throw new Error("AI 모델 호출 중 오류가 발생했습니다.");
    }
}

// Llama 모델을 사용하여 채팅하는 엔드포인트
server.post('/llama', async (req, res) => {
    console.log(req.body);
    const { prompt } = req.body;
    try {
        const answer = await chatWithModel(AI_MODEL.LLAMA, prompt);
        console.log("Llama 답변:", answer);
        res.json({ answer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DeepSeek 모델을 사용하여 채팅하는 엔드포인트
server.post('/deepseek', async (req, res) => {
    console.log(req.body);
    const { prompt } = req.body;
    try {
        const answer = await chatWithModel(AI_MODEL.DEEPSEEK, prompt);
        console.log("DeepSeek 답변:", answer);
        // DeepSeek 모델의 답변 형식에 따라 <think>와 </think> 태그를 추출
        const regex = /<think>(.*?)<\/think>(.*)/s;
        const match = answer.match(regex);
        if (match) {
            const [, rawThink, rawSay] = match;
            res.json({ think: rawThink.trim(), say: rawSay.trim() });
        } else {
            console.warn("`<think>`와 `</think>` 태그를 찾을 수 없습니다.");
            res.status(400).json({ error: "AI 모델 응답 형식이 잘못되었습니다." });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Flux 모델을 사용하여 이미지를 생성하는 엔드포인트
server.post('/flux', async (req, res) => {
    console.log(req.body);
    const { prompt } = req.body;
    try {
        const result = await createImage(AI_MODEL.FLUX, prompt);
        res.json({ result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 서버 시작
server.listen(port, () => {
    console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});