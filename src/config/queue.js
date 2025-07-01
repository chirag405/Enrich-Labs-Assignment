const amqp = require("amqplib");

let amqpConnection = null;
let messageChannel = null;

const connectQueue = async () => {
  try {
    amqpConnection = await amqp.connect(process.env.RABBITMQ_URL);
    messageChannel = await amqpConnection.createChannel();

    // Assert queue exists
    await messageChannel.assertQueue(process.env.QUEUE_NAME, {
      durable: true,
    });

    console.log("RabbitMQ Connected");
    return { connection: amqpConnection, channel: messageChannel };
  } catch (connectionError) {
    console.error("RabbitMQ connection error:", connectionError);
    throw connectionError;
  }
};

const getChannel = () => {
  if (!messageChannel) {
    throw new Error("Queue not connected. Call connectQueue() first.");
  }
  return messageChannel;
};

const publishMessage = async (queueName, messageContent) => {
  const currentChannel = getChannel();
  return currentChannel.sendToQueue(
    queueName,
    Buffer.from(JSON.stringify(messageContent)),
    {
      persistent: true,
    }
  );
};

const closeConnection = async () => {
  if (messageChannel) {
    await messageChannel.close();
  }
  if (amqpConnection) {
    await amqpConnection.close();
  }
};

module.exports = {
  connectQueue,
  getChannel,
  publishMessage,
  closeConnection,
};
