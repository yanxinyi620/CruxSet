"""Evaluate emitted polygons against frozen 369 wall polygons, never mask counts alone."""
import json, sys
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

ROOT=Path(__file__).resolve().parent

def raster(polygon):
    p=np.rint(np.asarray(polygon)).astype(np.int32)
    lo=p.min(axis=0); hi=p.max(axis=0)+1
    mask=np.zeros((hi[1]-lo[1],hi[0]-lo[0]),np.uint8)
    cv2.fillPoly(mask,[p-lo],1)
    return (*lo,*hi,mask,int(mask.sum()))

def iou_matrix(ref,pred):
    a=[raster(x['polygon']) for x in ref];b=[raster(x['polygon']) for x in pred]
    matrix=np.zeros((len(a),len(b)),dtype=np.float64)
    for i,r in enumerate(a):
        for j,p in enumerate(b):
            x1,y1=max(r[0],p[0]),max(r[1],p[1]);x2,y2=min(r[2],p[2]),min(r[3],p[3])
            if x2<=x1 or y2<=y1:continue
            inter=np.count_nonzero(r[4][y1-r[1]:y2-r[1],x1-r[0]:x2-r[0]] & p[4][y1-p[1]:y2-p[1],x1-p[0]:x2-p[0]])
            matrix[i,j]=inter/(r[5]+p[5]-inter)
    return matrix,np.array([x[5] for x in a])

def match(matrix,threshold):
    # Cardinality dominates every possible summed-IoU difference; then maximize IoU.
    valid=matrix>=threshold
    ri,pi=linear_sum_assignment(valid*(min(matrix.shape)+1)+matrix*valid,maximize=True)
    pairs=[(int(r),int(p),float(matrix[r,p])) for r,p in zip(ri,pi) if valid[r,p]]
    n,m=matrix.shape;tp=len(pairs);s=sum(x[2] for x in pairs)
    return dict(tp=tp,fp=m-tp,fn=n-tp,precision=tp/m if m else 0,recall=tp/n if n else 0,
        f1=2*tp/(n+m) if n+m else 0,matched_mean_iou=s/tp if tp else 0,pq=2*s/(n+m) if n+m else 0,pairs=pairs)

def evaluate(label):
    reference=json.loads((ROOT/'reference.json').read_text())['items']
    predicted=json.loads((ROOT/label/'candidates.json').read_text())['items']
    matrix,areas=iou_matrix(reference,predicted)
    result={'label':label,'reference_count':len(reference),'predicted_count':len(predicted)}
    for t in [.3,.5,.75]:result[f'iou{t}']=match(matrix,t)
    boundaries=np.quantile(areas,[1/3,2/3]); matched={p[0] for p in result['iou0.5']['pairs']}
    result['area_tertiles_pixels']=boundaries.tolist()
    result['size_recall']={}
    for k,indices in [('small',np.where(areas<=boundaries[0])[0]),('medium',np.where((areas>boundaries[0])&(areas<=boundaries[1]))[0]),('large',np.where(areas>boundaries[1])[0])]:
        result['size_recall'][k]={'n':len(indices),'matched':sum(int(i in matched) for i in indices)}
    np.save(ROOT/label/'iou.npy',matrix)
    (ROOT/label/'metrics.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({k:v for k,v in result.items() if not k.startswith('iou')}|{k:{a:b for a,b in v.items() if a!='pairs'} for k,v in result.items() if k.startswith('iou')}))
    return result

def self_test():
    square={'polygon':[[0,0],[10,0],[10,10],[0,10]]}
    matrix,_=iou_matrix([square],[square]);assert matrix[0,0]==1
    assert match(matrix,.5)['f1']==1
    duplicate=np.array([[1.,1.]])
    assert match(duplicate,.5)['tp']==1 and match(duplicate,.5)['fp']==1
    # Greedy best-IoU would lose a true positive here.
    assert match(np.array([[.99,.6],[.6,.49]]),.5)['tp']==2
    assert match(np.zeros((2,0)),.5)['fn']==2
    assert match(np.zeros((2,2)),.5)['tp']==0
    print('Evaluation self checks passed: identity, duplicates, optimal matching, empty and disjoint.')

if __name__=='__main__':
    if sys.argv[1]=='--self-test':self_test()
    else:evaluate(sys.argv[1])
