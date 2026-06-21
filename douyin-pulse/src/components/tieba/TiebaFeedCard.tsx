import { TiebaFeedItem } from '@/types/tieba';

interface Props {
  item: TiebaFeedItem;
  keyword: string;
  onClick: () => void;
}

export default function TiebaFeedCard({ item, keyword, onClick }: Props) {
  const avatarUrl = item.portrait 
    ? `https://gss0.baidu.com/7Ls0a8Sm2Q5IlBGlnYG/sys/portrait/item/${item.portrait}` 
    : '/default-avatar.png'; // 准备一个默认头像

  // 高亮关键字函数
  const renderHighlightedText = (text: string, kw: string) => {
    if (!kw) return text;
    const parts = text.split(new RegExp(`(${kw})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === kw.toLowerCase() 
        ? <span key={i} className="text-red-500 font-bold bg-red-50 px-1 rounded">{part}</span> 
        : part
    );
  };

  // 格式化时间
  const timeStr = new Date(item.create_time).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
            {item.fname}吧
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-gray-100 px-2 py-1 rounded">{item.source_type}</span>
            {timeStr}
          </span>
        </div>
        <h3 className="text-base font-bold text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-2">
          {item.thread_title}
        </h3>

        {/* 🎯 命中的发言区块 (情报靶心) */}
        <div className="mt-2 bg-gray-50 border-l-4 border-red-400 p-3 rounded-r-lg flex gap-3 items-start">
          <img 
            src={avatarUrl} 
            alt="avatar" 
            className="w-8 h-8 rounded-full border border-gray-200 shrink-0 object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-700 mb-1">{item.nick_name}</div>
            <div className="text-sm text-gray-600 line-clamp-3">
              {renderHighlightedText(item.hit_content, keyword)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}