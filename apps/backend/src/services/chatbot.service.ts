import prisma from '../database/prisma';

export const chatbotService = {
  processQuery: async (message: string, user: any) => {
    const lowerMessage = message.toLowerCase();

    // Intent 1: Private Farm Data (Structured Query)
    if (lowerMessage.includes('my order') || lowerMessage.includes('pending order')) {
      const orders = await prisma.order.findMany({
        where: {
          consumerId: user.id, // STRICT RBAC SCOPING
          status: 'PENDING'
        },
        include: { items: { include: { product: true } } },
        take: 5
      });
      
      let reply = `📦 You have ${orders.length} pending purchases:\n`;
      if (orders.length > 0) {
        reply += orders.map(o => {
          const productNames = o.items.map(i => i.product.name).join(', ');
          return `• ${productNames || 'Items'} (Order #${o.id.slice(-6)}) - ₹${o.totalPrice.toLocaleString()}`;
        }).join('\n');
      }

      return {
        reply,
        sources: [],
        badgeType: 'verified_private',
        generationProvenance: 'STRUCTURED_QUERY'
      };
    }

    if (lowerMessage.includes('my harvest') || lowerMessage.includes('my crop') || lowerMessage.includes('status') || lowerMessage.includes('my field')) {
      const crops = await prisma.crop.findMany({
        where: {
          farm: { userId: user.id } // STRICT RBAC SCOPING
        },
        take: 3,
        orderBy: { createdAt: 'desc' }
      });

      let reply = `You have ${crops.length} recent crop records.`;
      if (crops.length > 0) {
        reply += '\n' + crops.map(c => `- ${c.name} (${c.growthStage})`).join('\n');
      }

      return {
        reply,
        sources: [],
        badgeType: 'verified_private',
        generationProvenance: 'STRUCTURED_QUERY'
      };
    }

    // Intent 2: General Conversation (Ambiguous / Small Talk)
    if (['hi', 'hello', 'hey', 'thanks', 'thank you'].includes(lowerMessage.trim())) {
      return {
        reply: "Hello! I am AgroBot. I can help you check your farm's private records or search verified agricultural knowledge. What would you like to know?",
        sources: [],
        badgeType: 'unverified_mocked',
        generationProvenance: 'MOCKED'
      };
    }

    // Intent 3: Knowledge Base (Semantic Search)
    try {
      const mlServiceUrl = process.env.ML_SERVICE_URL || process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const response = await fetch(`${mlServiceUrl}/api/v1/ml/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message, threshold: 0.35 })
      });

      if (!response.ok) {
        throw new Error('ML Service RAG query failed');
      }

      const data = await response.json() as any;

      if (!data.is_confident || !data.matches || data.matches.length === 0) {
        // Generate a simulated 'hallucinated' response for ungrounded queries
        let hallucinatedReply = `While I don't have verified data on "${message}", general agricultural practices suggest careful planning and consulting with local experts.`;
        
        const lowerQuery = message.toLowerCase();
        if (lowerQuery.includes('best farmer')) {
          hallucinatedReply = "The title of 'best farmer' is highly subjective. However, leading farmers typically adopt sustainable practices, optimize their crop rotation, and integrate smart technology to maximize yield while preserving soil health.";
        } else if (lowerQuery.includes('tractor')) {
          hallucinatedReply = "Tractors are essential for modern farming. A good tractor should have appropriate horsepower for your acreage and support various implements. For small farms, a compact utility tractor (25-40 HP) is usually sufficient.";
        } else if (lowerQuery.includes('water')) {
          hallucinatedReply = "To save water, consider implementing drip irrigation, employing rainwater harvesting techniques, and planting drought-resistant crop varieties. Mulching can also significantly reduce soil moisture evaporation.";
        } else if (lowerQuery.includes('crop') || lowerQuery.includes('plant')) {
          hallucinatedReply = `When considering "${message}", it's important to test your soil pH first. Many general crops thrive in well-drained loamy soil with adequate sunlight.`;
        }

        return {
          reply: hallucinatedReply,
          sources: [],
          badgeType: 'unverified_mocked',
          generationProvenance: 'MOCKED'
        };
      }

      // We have confident matches, mock the LLM generation based on the top match
      const topMatch = data.matches[0];
      const reply = `Based on government resources: ${topMatch.content}`;

      return {
        reply,
        sources: [{
          title: topMatch.title,
          url: topMatch.sourceUrl,
          date: topMatch.sourceDate
        }],
        badgeType: 'verified_gov',
        generationProvenance: 'MOCKED'
      };

    } catch (error) {
      console.error('[ChatbotService] RAG Error:', error);
      return {
        reply: "Sorry, I am currently unable to access the knowledge base.",
        sources: [],
        badgeType: 'unverified_mocked',
        generationProvenance: 'MOCKED'
      };
    }
  }
};
