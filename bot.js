import { WechatyBuilder } from 'wechaty'
import qrcodeTerminal from 'qrcode-terminal'
import OpenAI from 'openai'

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: 'sk-ohelswywjcanfuxkeuqmiebjkfwvxmdlbvbpvrwfiqkpjwfa', // 从 https://cloud.siliconflow.cn/account/ak 获取
  baseURL: 'https://api.siliconflow.cn/v1'
})

// 客服角色的system prompt
const CUSTOMER_SERVICE_PROMPT = `你是MiX Copilot产品的专业客服代表。请以友善、专业的态度服务客户。

关于MiX Copilot的主要信息：
- MiX Copilot是一款强大的AI编程助手
- 支持多种编程语言，包括Python、JavaScript、Java等
- 提供代码补全、代码解释、bug修复等功能
- 可以通过自然语言对话的方式编程
- 定价方案：
  * 基础版：¥99/月
  * 专业版：¥199/月
  * 企业版：联系销售

你的主要职责是：
1. 热情接待用户，了解用户需求
2. 介绍MiX Copilot的核心功能和优势
3. 解答用户关于产品的疑问
4. 引导用户选择合适的版本并完成购买
5. 提供购买链接和付款指导

请记住：
- 始终保持专业和耐心
- 强调产品价值而不是强制推销
- 对技术问题给出准确解答
- 遇到无法解决的问题，及时转介绍给技术支持团队`

// 调用LLM获取回复
async function getLLMResponse(text) {
  try {
    const response = await client.chat.completions.create({
      model: 'Qwen/Qwen2.5-7B-Instruct',
      messages: [
        { role: 'system', content: CUSTOMER_SERVICE_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
    return response.choices[0].message.content
  } catch (error) {
    console.error('调用LLM出错:', error)
    return '抱歉,我现在无法回答。请稍后再试或联系我们的人工客服。'
  }
}

// 修改通知销售的函数
async function notifySales(userName) {
  try {
    // 使用完整的搜索方式查找联系人
    const salesContact = await bot.Contact.find({ 
      name: '薛志荣'  // 确保这个名字完全匹配微信里显示的名字
    })

    if (!salesContact) {
      console.log('未找到销售联系人，尝试模糊搜索...')
      // 获取所有联系人列表
      const contactList = await bot.Contact.findAll()
      // 查找名字中包含"薛志荣"的联系人
      const targetContact = contactList.find(c => c.name().includes('薛志荣'))
      
      if (targetContact) {
        await targetContact.ready() // 确保联系人信息已加载
        await targetContact.say(`有人想购买MiX Copilot，用户名字是${userName}`)
        console.log(`已通知销售 ${targetContact.name()} - ${userName} 对优惠感兴趣`)
        return
      }
    } else {
      await salesContact.ready() // 确保联系人信息已加载
      await salesContact.say(`有人想购买MiX Copilot，用户名字是${userName}`)
      console.log(`已通知销售 ${salesContact.name()} - ${userName} 对优惠感兴趣`)
      return
    }
    
    console.log('未能找到销售联系人，请检查联系人名称是否正确')
  } catch (error) {
    console.error('通知销售失败，错误详情:', error)
  }
}

const bot = WechatyBuilder.build({
  name: 'my-wechat-bot',
  puppet: 'wechaty-puppet-wechat',
  puppetOptions: {
    uos: true
  }
})

bot.on('scan', (qrcode, status) => {
  if (status === 2) {
    qrcodeTerminal.generate(qrcode, {small: true})
    console.log('请扫描二维码登录')
  }
})

bot.on('login', async (user) => {
  console.log(`用户 ${user} 登录成功`)
  const contactList = await bot.Contact.findAll()
  console.log('所有联系人列表：')
  contactList.forEach(c => {
    console.log(`联系人: ${c.name()}`)
  })
})

bot.on('logout', (user) => {
  console.log(`用户 ${user} 已登出`)
})

bot.on('message', async (message) => {
  const contact = message.talker()
  const text = message.text()
  const room = message.room()
  
  if(message.self()) {
    return
  }

  // 检查发送者昵称是否为"shadow"
  if(contact.name() !== 'shadow') {
    console.log(`忽略来自 ${contact.name()} 的消息，因为不是目标用户`)
    return
  }

  // 检查消息中是否包含"优惠"字眼
  if (text.includes('优惠')) {
    console.log(`检测到优惠关键词，准备通知销售，发送者: ${contact.name()}`)
    await notifySales(contact.name())
  }

  if(!room) { // 私聊消息
    console.log(`收到来自 ${contact.name()} 的消息: ${text}`)
    
    // 调用LLM获取回复
    const reply = await getLLMResponse(text)
    await message.say(reply)
  }
  
  if(room) { // 群聊消息
    const topic = await room.topic()
    console.log(`群名: ${topic} 发消息人: ${contact.name()} 内容: ${text}`)
    
    // 即使在群聊中，只要是shadow发的消息就回复，不需要@
    const reply = await getLLMResponse(text)
    await message.say(reply)
  }
})

bot.start()
  .then(() => console.log('开始登录微信'))
  .catch((e) => console.error(e))
