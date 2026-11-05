# Lists template literals (top-level, no nested templates) with positional keys: {0},{1}...
import re,sys,json
def scan(src):
    out=[]; i=0; n=len(src)
    while i<n:
        c=src[i]
        if c=='`':
            j=i+1; parts=['']; exprs=[]; nested=False
            while j<n and src[j]!='`':
                if src[j]=='\\': parts[-1]+=src[j:j+2]; j+=2; continue
                if src[j]=='$' and src[j+1]=='{':
                    d=1; k=j+2
                    while k<n and d:
                        if src[k]=='{': d+=1
                        elif src[k]=='}': d-=1
                        elif src[k]=='`': nested=True
                        k+=1
                    exprs.append(src[j+2:k-1]); parts.append(''); j=k; continue
                parts[-1]+=src[j]; j+=1
            key=parts[0]
            for e in range(len(exprs)): key+='{%d}'%e+parts[e+1]
            out.append((i,j+1,key,exprs,nested)); i=j+1
        elif c in '\'"':
            j=i+1
            while j<n and src[j]!=c:
                j+= 2 if src[j]=='\\' else 1
            i=j+1
        elif c=='/' and src[i+1]=='/':
            while i<n and src[i]!='\n': i+=1
        elif c=='/' and src[i+1]=='*':
            i=src.index('*/',i)+2
        else: i+=1
    return out
if __name__=='__main__':
    for f in sys.argv[1:]:
        s=open(f).read()
        for a,b,k,e,nest in scan(s):
            if re.search(r'[A-Za-z]{3,}',re.sub(r'<[^>]*>','',k)) and ' ' in k.strip() and not re.match(r'^[a-z-]+( [a-z-]+)*$',k) :
                print(('N ' if nest else '  ')+repr(k))
