export type MessageStatus='SENT'|'DELIVERED'|'READ';
export interface MessageImageDto { id:string; url:string; mimeType:string; width:number; height:number; sizeBytes:number; }
export interface ConversationUserDto { id:string; username:string; name:string; profileImageUrl:string|null; isVerified:boolean; }
export interface MessageDto { id:string; conversationId:string; senderId:string; messageType:'TEXT'|'IMAGE'; content:string; image?:MessageImageDto; createdAt:Date; updatedAt:Date; status:MessageStatus; deliveredAt:Date|null; readAt:Date|null; }
export interface ConversationSummaryDto { conversationId:string; otherUser:ConversationUserDto; lastMessage:MessageDto|null; lastMessageAt:Date|null; unreadCount:number; }
export interface ConversationDto { conversationId:string; otherUser:ConversationUserDto; createdAt:Date; updatedAt:Date; }
export type Ack<T>={success:true;data:T}|{success:false;error:{code:string;message:string}};
export interface ClientToServerEvents {
  'conversation:join':(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>void;
  'conversation:leave':(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>void;
  'message:send':(payload:{conversationId:string;content:string;messageType?:'TEXT'},ack:(result:Ack<MessageDto>)=>void)=>void;
  'message:delivered':(payload:{messageId:string},ack:(result:Ack<{messageId:string;status:'DELIVERED'|'READ';deliveredAt:Date|null;readAt:Date|null}>)=>void)=>void;
  'message:read':(payload:{conversationId:string;messageId:string},ack:(result:Ack<{messageId:string;status:'READ';readAt:Date|null}>)=>void)=>void;
  'typing:start':(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>void;
  'typing:stop':(payload:{conversationId:string},ack:(result:Ack<{conversationId:string}>)=>void)=>void;
}
export interface ServerToClientEvents {
  'message:new':(message:MessageDto)=>void;
  'message:delivered':(receipt:{conversationId:string;messageId:string;status:'DELIVERED';deliveredAt:Date|null;recipientId:string})=>void;
  'message:read':(receipt:{conversationId:string;messageId:string;status:'READ';readAt:Date|null;readerId:string})=>void;
  'typing:start':(payload:{conversationId:string;userId:string})=>void;
  'typing:stop':(payload:{conversationId:string;userId:string})=>void;
  'presence:update':(payload:{userId:string;isOnline:boolean;lastSeen:Date|null})=>void;
}
export interface InterServerEvents {}
export interface SocketData { user:{id:string;username:string;role:'USER'|'ADMIN'}; }

