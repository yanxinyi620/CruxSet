// @ts-nocheck
import { listMyWalls } from '../../../services/walls.js'
Page({data:{walls:[]},onShow(){listMyWalls().then(walls=>this.setData({walls}))}})
